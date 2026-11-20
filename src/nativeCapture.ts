import { invoke } from "@tauri-apps/api/core";

/** One raw BGRA frame in flight; GPU swizzle feeds the browser's WebRTC encoder. */
export async function startNativeStream(token: string, onFailure: () => void): Promise<{ stream: MediaStream; stop: () => void }> {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("GPU canvas unavailable");
  const shaders: WebGLShader[] = [];
  const shader = (type: number, source: string) => {
    const value = gl.createShader(type); if (!value) throw new Error("GPU shader unavailable");
    shaders.push(value); gl.shaderSource(value, source); gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error("GPU shader unavailable");
    return value;
  };
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, texture: WebGLTexture | null = null;
  let stream: MediaStream | undefined, timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true; clearTimeout(timer); stream?.getTracks().forEach(track => track.stop());
    gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(value => gl.deleteShader(value));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
  try {
    const vertex = shader(gl.VERTEX_SHADER, "attribute vec2 p; varying vec2 uv; void main(){uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);gl_Position=vec4(p,0.,1.);}");
    const fragment = shader(gl.FRAGMENT_SHADER, "precision mediump float; varying vec2 uv; uniform sampler2D frame; uniform vec2 cursor; uniform vec2 dimensions; uniform bool cursorVisible; void main(){vec4 c=texture2D(frame,uv);vec2 d=(uv-cursor)*dimensions;bool arrow=cursorVisible&&d.x>=0.&&d.y>=0.&&d.x<12.&&d.y<20.&&d.x<d.y*.65;gl_FragColor=arrow?vec4(vec3(d.x<1.5||d.y-d.x/0.65<2.?0.:1.),1.):vec4(c.b,c.g,c.r,1.);}");
    program = gl.createProgram(); if (!program) throw new Error("GPU program unavailable");
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("GPU program unavailable"); gl.useProgram(program);
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const dimensionsUniform = gl.getUniformLocation(program, "dimensions"), cursorUniform = gl.getUniformLocation(program, "cursor"), visibleUniform = gl.getUniformLocation(program, "cursorVisible");
    const maximumTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    let width = 0, height = 0;
    const render = (raw: ArrayBuffer) => {
      if (stopped || raw.byteLength === 0) return false;
      if (raw.byteLength < 16) throw new Error("invalid frame");
      const header = new DataView(raw), nextWidth = header.getUint32(0,true), nextHeight = header.getUint32(4,true);
      const cursorOnly=raw.byteLength===16;
      if (!nextWidth || !nextHeight || nextWidth > maximumTexture || nextHeight > maximumTexture || (!cursorOnly && raw.byteLength !== 16 + nextWidth * nextHeight * 4) || nextWidth * nextHeight > 33_177_600) throw new Error("invalid frame");
      if(cursorOnly && (width!==nextWidth || height!==nextHeight))throw new Error("cursor without desktop frame");
      if (width !== nextWidth || height !== nextHeight) {
        width = nextWidth; height = nextHeight; canvas.width = width; canvas.height = height; gl.viewport(0,0,width,height);
        // Reallocate only on a real display-size change, not on every frame.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      const x = header.getInt32(8,true), y = header.getInt32(12,true);
      gl.uniform2f(dimensionsUniform, width, height); gl.uniform2f(cursorUniform, x / width, y / height); gl.uniform1i(visibleUniform, x >= 0 && y >= 0 && x < width && y < height ? 1 : 0);
      if(!cursorOnly)gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(raw,16));
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      if (gl.isContextLost()) throw new Error("GPU context lost");
      return true;
    };
    const firstDeadline = performance.now() + 2500;
    while (!width && performance.now() < firstDeadline) {
      render(await invoke<ArrayBuffer>("next_desktop_frame", { sessionToken: token }));
    }
    if (!width) throw new Error("desktop produced no frame");
    stream = canvas.captureStream(0);
    const video = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    if (!video || typeof video.requestFrame !== "function") throw new Error("canvas frame capture unavailable");
    video.requestFrame();
    const poll = async () => {
      const started = performance.now();
      try {
        const raw = await invoke<ArrayBuffer>("next_desktop_frame", { sessionToken: token });
        if (render(raw)) video.requestFrame();
      } catch {
        if (!stopped) { stop(); onFailure(); }
        return;
      }
      if (!stopped) timer = setTimeout(() => void poll(), Math.max(0, 1000 / 60 - (performance.now() - started)));
    };
    void poll();
    return { stream, stop };
  } catch (error) { stop(); throw error; }
}
