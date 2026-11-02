// Stable identifiers also used by the native appearance preference.
// Three colour schemes, each tuned for light and dark appearance.
export const THEMES = [
 {id:'collage',name:'晴空',tag:'蓝天白云 · 明亮 · 默认',layout:'sky',nav:'side',radius:14,font:'sans',
  brand:'#1f7bff',bg:'#eef6ff',paper:'#ffffff',ink:'#0f2340',dim:'#566a85',line:'#d6e5f5',tint:'#e2f0ff',second:'#ffb31a',
  dark:{brand:'#5ea8ff',bg:'#0b1b37',paper:'#16233b',ink:'#e8eef8',dim:'#9fb0c8',line:'#253756',tint:'#163057',second:'#ffc24a'},
  subtitle:'课堂里的片段，慢慢拼成理解。'},
 {id:'playful',name:'紫藤',tag:'柔和 · 安静',layout:'wisteria',nav:'side',radius:14,font:'sans',
  brand:'#7055d4',bg:'#f6f5f9',paper:'#ffffff',ink:'#241f33',dim:'#6e6784',line:'#e6e2ee',tint:'#efeafb',second:'#ef9f99',
  dark:{brand:'#9d88f3',bg:'#17151d',paper:'#211e29',ink:'#ece9f4',dim:'#a39db6',line:'#332f3f',tint:'#2b2442',second:'#ef9f99'},
  subtitle:'沿着一个问题，发现新的世界。'},
 {id:'film',name:'琥珀',tag:'温暖 · 纸本 · 护眼',layout:'amber',nav:'side',radius:8,font:'serif',
  brand:'#b0612b',bg:'#f4efe6',paper:'#fffcf6',ink:'#2f2a24',dim:'#7b6f62',line:'#e5dccd',tint:'#f5e7d3',second:'#7f9163',
  dark:{brand:'#e19b5c',bg:'#1a1714',paper:'#24201c',ink:'#ede5d9',dim:'#aa9d8c',line:'#38312a',tint:'#3b2c1e',second:'#a3b388'},
  subtitle:'重新播放，慢慢看懂。'},
];
// Earlier releases offered twenty decorative themes; each maps to the closest colour scheme.
const LEGACY={editorial:'playful',candy:'playful',retro:'playful',gallery:'playful',bauhaus:'film',field:'film',marginalia:'film',racing:'film',press:'collage',acid:'collage',terminal:'collage',swiss:'collage',workshop:'collage',post:'collage',memphis:'collage',glass:'collage',metro:'collage',sketch:'collage'};
export function themeFor(value){const id=LEGACY[value]||value;return THEMES.find(t=>t.id===id)||THEMES[0];}
export function themeIcon(value){return 'theme-'+themeFor(value).id+'.png';}
export const APPEARANCE_MODES=[['system','跟随系统'],['light','浅色'],['dark','深色']];
