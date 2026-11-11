'use client';
import {useEffect,useState} from 'react';
import {formatIST} from '../../lib/time';
export default function AppClock(){const [now,setNow]=useState<string|null>(null);useEffect(()=>{const tick=()=>setNow(new Date().toISOString());tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[]);return <span className="font-mono tabular-nums" title="India Standard Time · UTC+05:30">{now?formatIST(now,true):'IST · UTC+05:30'}</span>}
