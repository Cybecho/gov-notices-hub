import {hosted,read,write,archives} from '../io.mjs';
import {buildReader} from './model.mjs';
export async function expectedReader(){
 const [sources,catalog,live,a,syndication,health]=await Promise.all([read('data/sources.json'),read('catalog/citations.json'),read('data/notices.json'),archives(),read('data/syndication.json'),read('data/health.json')]);
 return buildReader({sources,catalog,live,archiveItems:Object.values(a).flatMap(m=>m.items),syndication,health});
}
if(import.meta.main){hosted();const reader=await expectedReader(); await write('data/reader.json',reader);console.log(`Generated ${reader.items.length} direct bibliographic links from ${new Set(reader.items.map(i=>i.sourceId)).size} channels; ${reader.catalogEntries.length} catalog records; ${reader.highlights.length} separate references.`);}
