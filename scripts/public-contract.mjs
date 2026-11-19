/** @typedef {import('./link-contract.ts').PublicLink} PublicLink */
/** @param {PublicLink} row @returns {boolean} */
export function checkedLink(row){return typeof row.id==='string'&&typeof row.url==='string'&&row.url.startsWith('https://')&&typeof row.title==='string'&&row.title.trim().length>0&&typeof row.sourceId==='string'&&(row.publishedAt===null||typeof row.publishedAt==='string')&&(row.department===null||typeof row.department==='string');}
