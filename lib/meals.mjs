import {McpError} from './mcp-client.mjs';
export const safeImage = value => {try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='menu-img.mcd.cn'&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}};
export function foodTags(name,components=[]){const s=[name,...components].join(' '),tags=[];if(/牛|巨无霸|吉士汉堡/.test(s)||components.some(x=>/^汉堡包(?: ×\d+)?$/.test(x)))tags.push('beef');if(/鸡|板烧/.test(s))tags.push('chicken');if(/鱼/.test(s))tags.push('fish');if(/卷/.test(name))tags.unshift('wrap');if(/早餐|麦满分/.test(name))tags.unshift('breakfast');if(/辣|咖喱/.test(s))tags.push('spicy');if(/冰|可乐|雪碧|奶昔|芬达/.test(s))tags.push('iced');return tags;}
function defaults(modification){const values=[];for(const group of modification?.items||[]){for(const value of group.values||[]){const n=value.selectedQuantity;if(Number.isInteger(n)&&n>0&&typeof value.selectedKey==='string')values.push({code:value.code,key:value.selectedKey,quantity:n});else if(n===0&&typeof value.unselectedKey==='string')values.push({code:value.code,key:value.unselectedKey,quantity:0});}}return values.length?{modification:{values}}:{};}
export function prepareDefaultMeal(detail,excluded=[]){
 if(!detail||typeof detail.code!=='string'||!/^\d+$/.test(detail.code)||!Array.isArray(detail.rounds)||!detail.rounds.length||detail.rounds.length>10)throw new McpError('UNSUPPORTED','这份餐单没有可确认的套餐组成。');
 const components=[];
 const roundList=detail.rounds.map(round=>{
  if(!Array.isArray(round.choices)||!Number.isInteger(round.minQuantity)||!Number.isInteger(round.maxQuantity))throw new McpError('UNSUPPORTED','套餐分组规则缺失。');
  let choices=round.choices.filter(x=>x.isDefault===1&&Number.isInteger(x.quantity)&&x.quantity>0).map(x=>({...x}));
  if(excluded.includes('iced')&&choices.some(x=>foodTags(x.name).includes('iced'))){
   const hot=round.choices.find(x=>/热/.test(x.name)&&!foodTags(x.name).includes('iced')&&x.maxQuantity!==0);
   if(hot&&choices.length===1&&round.minQuantity===1&&round.maxQuantity===1)choices=[{...hot,quantity:1}];
  }
  const count=choices.reduce((n,x)=>n+x.quantity,0);
  if(count<round.minQuantity||count>round.maxQuantity||!choices.length)throw new McpError('UNSUPPORTED','套餐缺少合规默认搭配，已跳过。');
  return {round:String(round.id),comboItemList:choices.map(choice=>{if(typeof choice.code!=='string'||!/^\d+$/.test(choice.code))throw new McpError('UNSUPPORTED','套餐子项编码无效。');components.push(`${choice.name}${choice.quantity>1?' ×'+choice.quantity:''}`);return {code:choice.code,quantity:choice.quantity,...defaults(choice.modification)};})};
 });
 const tags=foodTags(detail.name,components);
 if(tags.some(x=>excluded.includes(x)))throw new McpError('PREFERENCE','不符合本轮口味筛选。');
 return {item:{productCode:detail.code,quantity:1,roundList,...defaults(detail.modification)},components,tags};
}
function displayedFen(value){if(typeof value!=='string'||!/^\d+(\.\d{1,2})?$/.test(value))return null;const [a,b='']=value.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
export async function mealPlans(client,{storeCode,storeName,budgetFen,excluded=[]}){
 const context={storeCode,orderType:1,beType:1};
 const menu=await client.call('query-meals',context);
 if(!menu||!menu.meals||typeof menu.meals!=='object')throw new McpError('FORMAT','当前门店菜单格式无法识别。');
 const all=Object.entries(menu.meals).filter(([code,m])=>/^\d+$/.test(code)&&typeof m.name==='string'&&!m.canWithOrder&&!m.withOrder&&/套餐|三件套|两件套/.test(m.name)&&!/双人|亲子|多人|分享|开心|儿童|派对|欢聚/.test(m.name));
 const sorted=all.map(([code,m])=>({code,...m,displayFen:displayedFen(m.currentPrice)})).filter(m=>!foodTags(m.name).some(t=>excluded.includes(t)&&t!=='iced')).sort((a,b)=>(a.displayFen??1e9)-(b.displayFen??1e9));
 // Inspect a bounded set, with different main courses represented before filling.
 const chosen=[],kinds=new Set();for(const m of sorted){const kind=foodTags(m.name).find(x=>['wrap','beef','chicken','fish','breakfast'].includes(x))||'unknown';if(!kinds.has(kind)){chosen.push(m);kinds.add(kind);}}
 for(const m of sorted)if(!chosen.includes(m))chosen.push(m);
 const options=[],failures=[];let inspected=0,firstQuote=null;
 for(const product of chosen.slice(0,8)){
  inspected++;
  try{
   const detail=await client.call('query-meal-detail',{...context,code:product.code});
   const prepared=prepareDefaultMeal(detail,excluded);
   const quotedAt=new Date().toISOString();
   const quote=await client.call('calculate-price',{...context,items:[prepared.item],needTableware:false});
   if(!Number.isSafeInteger(quote?.price)||quote.price<0)throw new McpError('FORMAT','应付金额格式不符合已验证的整数分结构。');
   firstQuote ||= quotedAt;
   const art=prepared.tags.find(t=>['wrap','breakfast','beef','fish','chicken'].includes(t))||'chicken';
   options.push({id:product.code,name:detail.name,components:prepared.components,tags:prepared.tags,art,image:safeImage(product.image),amountFen:quote.price,quoteStatus:'official-quoted'});
  }catch(error){if(['TOKEN','RATE_LIMIT','NETWORK','HTTP','RPC'].includes(error.code))throw error;failures.push({code:product.code,reason:error.code||'UNAVAILABLE'});}
  if(options.filter(x=>x.amountFen<=budgetFen).length>=6)break;
 }
 if(!options.length)throw new McpError('NO_MEALS','未找到可确认组成并成功核价的单人套餐，请换一家门店或调整筛选。');
 return {source:'mcp-calculate-price',storeName,fulfillment:'到店自取 · 默认套餐搭配',quotedAt:firstQuote,options,scope:{menuProducts:Object.keys(menu.meals).length,productsInspected:inspected,quoted:options.length,skipped:failures.length},notice:'只比较本次核价的候选，不代表全菜单最低价；请在官方渠道核对下单。'};
}
