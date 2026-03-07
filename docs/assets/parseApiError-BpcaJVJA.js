async function n(s,a){const r=a||`請求失敗 (${s.status})`;try{const t=await s.json();return t.detail||t.message||JSON.stringify(t)}catch{return r}}export{n as p};
