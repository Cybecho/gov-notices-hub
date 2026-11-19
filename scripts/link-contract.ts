export type Category=`E${1|2|3|4|5}`|`F${1|2|3|4}`;
export interface PublicLink {id:string;title:string;publishedAt:string|null;fetchedAt:string;sourceId:string;sourceName:string;category:Category;kind:'press'|'report'|'data'|'brief'|'notice';department:string|null;url:string}
export interface Timeline {updatedAt:string|null;items:PublicLink[]}
export interface Source {id:string;name:string;category:Category;kind:'rss'|'api'|'html'|'static';role:'candidate'|'government'|'district'|'dashboard'|'reference';status:'active'|'paused'|'static';listUrl:string|null;lastChecked:string|null;lastError:string|null;lastItemCount:number|null;note:string}
export interface ArchiveIndex {files:{month:string;path:string;count:number}[]}
