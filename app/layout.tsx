import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Arthapalana | Portfolio intelligence',description:'Your portfolios, market prices and evidence behind every decision.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body><script dangerouslySetInnerHTML={{__html:"try{var t=localStorage.getItem('arthapalana-theme')||'dark';var e=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.theme=e;document.documentElement.style.colorScheme=e}catch(e){}"}}/>{children}</body></html>}
