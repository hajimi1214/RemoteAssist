import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeSummaries } from "./sessionJournal";
import type { SessionSummary } from "./sessionJournal";

const keyFor=(userId:string)=>`remoteassist.summary.${encodeURIComponent(userId)}`;
export function useSessionJournal(userId:string|undefined) {
  const [records,setRecords]=useState<SessionSummary[]>([]);
  const [persist,setPersist]=useState(false);
  const [storageError,setStorageError]=useState("");
  const account=useRef(userId);account.current=userId;
  const state=useRef({userId:undefined as string|undefined,persist:false,records:[] as SessionSummary[]});
  useEffect(()=>{
    let records:SessionSummary[]=[];let persist=false;
    if(userId)try{persist=localStorage.getItem(keyFor(userId)+".enabled")==="true";if(persist){const raw=localStorage.getItem(keyFor(userId));if(raw&&raw.length<=100_000)records=sanitizeSummaries(JSON.parse(raw));localStorage.setItem(keyFor(userId),JSON.stringify(records));}}catch{/* Invalid local metadata never blocks authentication. */}
    state.current={userId,persist,records};setRecords(records);setPersist(persist);setStorageError("");
  },[userId]);
  const save=useCallback(()=>{
    const current=state.current;if(!current.userId)return;
    try{
      if(current.persist){localStorage.setItem(keyFor(current.userId),JSON.stringify(current.records));localStorage.setItem(keyFor(current.userId)+".enabled","true");}
      else{localStorage.removeItem(keyFor(current.userId));localStorage.removeItem(keyFor(current.userId)+".enabled");}
      setStorageError("");
    }catch{setStorageError(current.persist?"摘要保存失败，当前列表已在内存更新，但磁盘副本可能仍是旧记录。请稍后重试。":"无法删除已保存的摘要，原副本可能仍在本机。请恢复存储访问后重试关闭保留。");}
  },[]);
  const add=useCallback((owner:string,summary:SessionSummary)=>{
    if(account.current!==owner||state.current.userId!==owner){
      // Unmount after sign-out may finalize a session after the active account
      // changed. Write only to its opted-in owner store, never the new user's UI.
      try{
        if(localStorage.getItem(keyFor(owner)+".enabled")!=="true")return;
        const raw=localStorage.getItem(keyFor(owner));
        const previous=raw&&raw.length<=100_000?sanitizeSummaries(JSON.parse(raw)):[];
        localStorage.setItem(keyFor(owner),JSON.stringify(sanitizeSummaries([summary,...previous])));
      }catch{/* A summary write must never interrupt input revocation. */}
      return;
    }
    state.current.records=sanitizeSummaries([summary,...state.current.records]);setRecords(state.current.records);if(state.current.persist)save();
  },[save]);
  const setPersistence=useCallback((enabled:boolean)=>{if(!state.current.userId||account.current!==state.current.userId)return;state.current.persist=enabled;setPersist(enabled);save();},[save]);
  const clear=useCallback(()=>{if(account.current!==state.current.userId)return;state.current.records=[];setRecords([]);save();},[save]);
  const current=state.current.userId===userId;
  return{records:current?records:[],persist:current?persist:false,storageError:current?storageError:"",add,setPersistence,clear,retryStorage:save};
}
