import React from 'react';
import {Icon} from './components/ui/icon.js';
const names={folder:'Folder',file:'FileText',code:'Code',image:'File',server:'ComputerTerminal01',globe:'Globe',chevron:'ChevronRight',plus:'Plus',refresh:'Loading'} as const;
export function ExplorerIcon({name,className='size-4'}:{name:keyof typeof names;className?:string}){return <Icon name={names[name]} className={className+' shrink-0'}/>;}
export function fileIcon(name:string){return /\.(?:tsx?|jsx?|json|html?|css|scss|py|php|sh|ya?ml|toml|xml|sql|vue|go|rs)$/i.test(name)?'code':/\.(?:png|jpe?g|webp|gif|svg|avif|ico)$/i.test(name)?'image':'file';}
