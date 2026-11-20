import { invoke } from "@tauri-apps/api/core";
import { parseCaptureFrame } from "./captureFrame";
import type { CaptureBaseline } from "./captureFrame";
import { captureDamage, damageScissor, visibleCaptureCursor } from "./captureDamage";
import type { CaptureCursor } from "./captureDamage";

/** One raw BGRA frame in flight; GPU swizzle feeds the browser's WebRTC encoder. */
export async function startNativeStream(token: string, onFailure: () => void): Promise<{ stream: MediaStream; stop: () => void; setFrameRate: (fps: number) => void }> {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("GPU canvas unavailable");
  // Partial draws require the previous canvas pixels to survive presentation.
  const partialDraws = gl.getContextAttributes()?.preserveDrawingBuffer === true;
  const shaders: WebGLShader[] = [];
  const shader = (type: number, source: string) => {
    const value = gl.createShader(type); if (!value) throw new Error("GPU shader unavailable");
    shaders.push(value); gl.shaderSource(value, source); gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error("GPU shader unavailable");
    return value;
  };
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, texture: WebGLTexture | null = null;
  let stream: MediaStream | undefined, timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
  const contextLost = () => { if (!stopped) { stop(); onFailure(); } };
  canvas.addEventListener("webglcontextlost", contextLost);
  const stop = () => {
    if (stopped) return;
    stopped = true; clearTimeout(timer); stream?.getTracks().forEach(track => track.stop());
    canvas.removeEventListener("webglcontextlost", contextLost);
    gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(value => gl.deleteShader(value));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
  try {
    const vertex = shader(gl.VERTEX_SHADER, "attribute vec2 p; varying vec2 uv; void main(){uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);gl_Position=vec4(p,0.,1.);}");
    const fragment = shader(gl.FRAGMENT_SHADER, "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nvarying vec2 uv; uniform sampler2D frame; uniform vec2 cursor; uniform vec2 dimensions; uniform bool cursorVisible; void main(){vec4 c=texture2D(frame,uv);vec2 d=(uv-cursor)*dimensions;bool arrow=cursorVisible&&d.x>=0.&&d.y>=0.&&d.x<12.&&d.y<20.&&d.x<d.y*.65;gl_FragColor=arrow?vec4(vec3(d.x<1.5||d.y-d.x/0.65<2.?0.:1.),1.):vec4(c.b,c.g,c.r,1.);}");
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
    // These capability queries happen once at setup, never in the per-frame GPU path.
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error("GPU capture setup failed");
    let width = 0, height = 0;
    let baseline: CaptureBaseline | null = null;
    let cursor: CaptureCursor = null;
    const exactScissor = partialDraws && (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ?? 0) >= 16;
    const render = (raw: ArrayBuffer, requestFrame?: () => void) => {
      if (stopped || raw.byteLength === 0) return false;
      const frame = parseCaptureFrame(raw, baseline, maximumTexture);
      if (!frame) return false;
      const nextWidth = frame.width, nextHeight = frame.height;
      const resized = width !== nextWidth || height !== nextHeight;
      if (resized) {
        width = nextWidth; height = nextHeight; canvas.width = width; canvas.height = height; gl.viewport(0,0,width,height);
        // Reallocate only on a real display-size change, not on every frame.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // A display-size change is rare; checking allocation errors here avoids a
        // synchronous GPU query after every ordinary upload and draw.
        if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error("GPU capture allocation failed");
      }
      const nextCursor = visibleCaptureCursor(frame.cursorX, frame.cursorY, width, height);
      const fullDraw = resized || frame.kind === "full" || !exactScissor;
      const damage = fullDraw ? [] : captureDamage(frame.rects, cursor, nextCursor, width, height);
      gl.uniform2f(dimensionsUniform, width, height); gl.uniform2f(cursorUniform, (nextCursor?.x ?? 0) / width, (nextCursor?.y ?? 0) / height); gl.uniform1i(visibleUniform, nextCursor ? 1 : 0);
      for (const rect of frame.rects) gl.texSubImage2D(gl.TEXTURE_2D, 0, rect.x, rect.y, rect.width, rect.height, gl.RGBA, gl.UNSIGNED_BYTE, rect.pixels);
      cursor = nextCursor;
      baseline = { width, height, sequence: frame.sequence };
      if (!fullDraw && !damage.length) return false;
      requestFrame?.();
      if (fullDraw) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      else {
        gl.enable(gl.SCISSOR_TEST);
        for (const rect of damage) {
          gl.scissor(...damageScissor(rect, height));
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        gl.disable(gl.SCISSOR_TEST);
      }
      return true;
    };
    const firstDeadline = performance.now() + 2500;
    while (!stopped && !width && performance.now() < firstDeadline) {
      render(await invoke<ArrayBuffer>("next_desktop_frame", { sessionToken: token }));
    }
    if (stopped || !width) throw new Error("desktop produced no frame");
    stream = canvas.captureStream(0);
    const video = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    if (!video || typeof video.requestFrame !== "function") throw new Error("canvas frame capture unavailable");
    video.requestFrame();
    // Paint once with the capture track attached, including on an idle desktop.
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    let fps = 60, lastPull = performance.now();
    const schedulePull = () => {
      timer = setTimeout(() => {
        timer = undefined;
        void poll();
      }, Math.max(0, lastPull + 1000 / fps - performance.now()));
    };
    const poll = async () => {
      if (stopped) return;
      lastPull = performance.now();
      try {
        const raw = await invoke<ArrayBuffer>("next_desktop_frame", { sessionToken: token });
        render(raw, () => video.requestFrame());
      } catch {
        if (!stopped) { stop(); onFailure(); }
        return;
      }
      if (!stopped) schedulePull();
    };
    schedulePull();
    return { stream, stop, setFrameRate: value => {
      if (stopped || !Number.isFinite(value) || value < 1 || value > 60 || value === fps) return;
      fps = value;
      if (timer !== undefined) { clearTimeout(timer); schedulePull(); }
    } };
  } catch (error) { stop(); throw error; }
}
