import {readFile} from 'node:fs/promises';
export async function loadToken(){
 if(process.env.MCD_MCP_TOKEN)return process.env.MCD_MCP_TOKEN.trim();
 try{const env=await readFile(new URL('../.env',import.meta.url),'utf8');return env.match(/^MCD_MCP_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/,'$2')||'';}catch{return '';}
}
