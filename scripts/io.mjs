import fs from 'node:fs/promises';
export const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
export const write=async(p,data)=>{const tmp=p+'.candidate';await fs.writeFile(tmp,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');await fs.rename(tmp,p);};
export async function archives(){const idx=await read('data/archive/index.json');if(!Array.isArray(idx.files))throw Error('archive index');const out={};for(const f of idx.files){if(!/^(\d{4}-(0[1-9]|1[0-2])|undated)$/.test(f.month)||f.path!==`data/archive/${f.month}.json`||Object.hasOwn(out,f.month))throw Error('invalid archive');const a=await read(f.path);if(a.items.length!==f.count)throw Error('archive count');out[f.month]=a;}return out;}
export function hosted(){if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('Hosted Ubuntu only');}
export const kstNow=()=>new Date(Date.now()+9*3600000).toISOString().replace(/Z$/,'+09:00');
