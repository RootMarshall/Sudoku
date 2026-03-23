import { useState, useEffect, useCallback, useRef } from "react";
import { playCorrect, playWrong, playVictory } from "./sounds";

// ── Seeded RNG (same puzzle for same seed) ──────────────────────────────────────
function mulberry32(seed){
  return function(){
    let t=seed+=0x6D2B79F5;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return((t^t>>>14)>>>0)/4294967296;
  };
}
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h=h&h; } return Math.abs(h); }
function getTodayUTC(){ return new Date().toISOString().slice(0,10); }
// ──────────────────────────────────────────────────────────────────────────────

// ── Sudoku generation ──────────────────────────────────────────────────────────
function emptyGrid() { return Array.from({length:9},()=>Array(9).fill(0)); }

function isValid(g,r,c,n){
  for(let i=0;i<9;i++){if(g[r][i]===n||g[i][c]===n)return false;}
  const br=Math.floor(r/3)*3,bc=Math.floor(c/3)*3;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(g[br+i][bc+j]===n)return false;
  return true;
}

function solve(g,random){
  const rng=random||(()=>Math.random());
  for(let row=0;row<9;row++)for(let col=0;col<9;col++){
    if(g[row][col]===0){
      const nums=[1,2,3,4,5,6,7,8,9].sort(()=>rng()-0.5);
      for(const n of nums){
        if(isValid(g,row,col,n)){g[row][col]=n;if(solve(g,rng))return true;g[row][col]=0;}
      }
      return false;
    }
  }
  return true;
}

function countSolutions(g,limit){
  let count=0;
  function rec(){
    for(let r=0;r<9;r++)for(let c=0;c<9;c++){
      if(g[r][c]===0){
        for(let n=1;n<=9;n++){
          if(isValid(g,r,c,n)){
            g[r][c]=n;
            rec();
            g[r][c]=0;
            if(count>=limit)return;
          }
        }
        return;
      }
    }
    count++;
  }
  rec();
  return count;
}

function generatePuzzle(difficulty,random){
  const rng=random||(()=>Math.random());
  const solution=emptyGrid();
  solve(solution,rng);
  const targetClues={easy:45,medium:35,hard:25,impossible:17}[difficulty]||35;
  const puzzle=solution.map(r=>[...r]);

  const cells=[];
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)cells.push([r,c]);
  cells.sort(()=>rng()-0.5);

  let clues=81;
  for(const [r,c] of cells){
    if(clues<=targetClues)break;
    const saved=puzzle[r][c];
    puzzle[r][c]=0;
    if(countSolutions(puzzle,2)!==1){
      puzzle[r][c]=saved;
    } else {
      clues--;
    }
  }
  return {puzzle,solution};
}
// ──────────────────────────────────────────────────────────────────────────────

const HEARTS = ["♥","♥","♥","♥","♥"];
const SAVE_KEY = 'sudoku-save';
const RECORDS_KEY = 'sudoku-records';
const DAILY_KEY = 'sudoku-daily';

function getRecords(){ try{ return JSON.parse(localStorage.getItem(RECORDS_KEY)||'{}'); }catch{ return {}; } }
function saveRecord(difficulty,time){ const r=getRecords(); if(r[difficulty]==null||time<r[difficulty]){ r[difficulty]=time; localStorage.setItem(RECORDS_KEY,JSON.stringify(r)); return true; } return false; }
function getDailyCompleted(){ try{ const d=JSON.parse(localStorage.getItem(DAILY_KEY)||'null'); return d&&d.date===getTodayUTC()?d:null; }catch{ return null; } }
function saveDailyCompleted(difficulty,time){ localStorage.setItem(DAILY_KEY,JSON.stringify({date:getTodayUTC(),difficulty,time})); }

export default function Sudoku(){
  const [screen,setScreen]=useState("menu"); // menu | game | over | win
  const [paused,setPaused]=useState(false);
  const [reviewFrom,setReviewFrom]=useState(null); // null | 'over' | 'win'
  const [difficulty,setDifficulty]=useState("medium");
  const [puzzle,setPuzzle]=useState(null);
  const [solution,setSolution]=useState(null);
  const [board,setBoard]=useState(null);   // user values
  const [notes,setNotes]=useState(null);   // 9x9 array of Set<number>
  const [given,setGiven]=useState(null);   // fixed cells
  const [selected,setSelected]=useState(null);
  const [highlightedKeys,setHighlightedKeys]=useState([]); // "r,c" strings — drag-paint selection; notes apply to all when in note mode
  const [noteMode,setNoteMode]=useState(false);
  const [lives,setLives]=useState(5);
  const [time,setTime]=useState(0);
  const [errors,setErrors]=useState(null); // Set of "r,c"
  const [lastGuess,setLastGuess]=useState(null); // { r, c, correct } for animation
  const [isNewRecord,setIsNewRecord]=useState(false);
  const [hasSave,setHasSave]=useState(false);
  const [isDailyGame,setIsDailyGame]=useState(false);
  const [dailyCompleted,setDailyCompleted]=useState(null);
  const [showDailyConfirm,setShowDailyConfirm]=useState(false);
  const [dailyModalMode,setDailyModalMode]=useState('confirm'); // 'confirm' | 'completed' | 'inprogress'
  const [user,setUser]=useState(null);
  const [loginLoading,setLoginLoading]=useState(false);
  const [loginError,setLoginError]=useState(null);
  const [leaderboard,setLeaderboard]=useState(null);
  const [leaderboardLoading,setLeaderboardLoading]=useState(false);
  const [dailyClickLoading,setDailyClickLoading]=useState(false);
  const timerRef=useRef(null);
  const [gameScale,setGameScale]=useState(1);
  const [dropTarget,setDropTarget]=useState(null);
  const paintSelectRef=useRef(false);

  async function refreshLeaderboard() {
    if (!electronAPI || !user) return;
    setLeaderboardLoading(true);
    try {
      const lb = await electronAPI.getLeaderboard(getTodayUTC());
      if (lb && lb.leaderboard) setLeaderboard(lb.leaderboard);
    } catch { /* ignore */ }
    finally { setLeaderboardLoading(false); }
  }

  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;

  const startTimer=useCallback(()=>{
    if(timerRef.current)clearInterval(timerRef.current);
    timerRef.current=setInterval(()=>setTime(t=>t+1),1000);
  },[]);

  const stopTimer=useCallback(()=>{
    if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null;}
  },[]);

  useEffect(()=>()=>stopTimer(),[stopTimer]);

  function startGame(){
    const {puzzle:p,solution:s}=generatePuzzle(difficulty);
    setPuzzle(p);
    setSolution(s);
    const b=p.map(r=>[...r]);
    setBoard(b);
    setGiven(p.map(r=>r.map(v=>v!==0)));
    setNotes(Array.from({length:9},()=>Array.from({length:9},()=>new Set())));
    setErrors(new Set());
    setLives(5);
    setTime(0);
    setSelected(null);
    setHighlightedKeys([]);
    setNoteMode(false);
    setLastGuess(null);
    setPaused(false);
    setReviewFrom(null);
    setIsNewRecord(false);
    setIsDailyGame(false);
    setScreen("game");
    startTimer();
  }

  function startDailyGame(){
    const today=getTodayUTC();
    const seed=hashStr(today);
    const random=mulberry32(seed);
    const {puzzle:p,solution:s}=generatePuzzle(difficulty,random);
    setPuzzle(p);
    setSolution(s);
    const b=p.map(r=>[...r]);
    setBoard(b);
    setGiven(p.map(r=>r.map(v=>v!==0)));
    setNotes(Array.from({length:9},()=>Array.from({length:9},()=>new Set())));
    setErrors(new Set());
    setLives(5);
    setTime(0);
    setSelected(null);
    setHighlightedKeys([]);
    setNoteMode(false);
    setLastGuess(null);
    setPaused(false);
    setReviewFrom(null);
    setIsNewRecord(false);
    setIsDailyGame(true);
    setScreen("game");
    startTimer();
  }

  function saveGame(){
    if(screen!=="game"&&screen!=="over"&&screen!=="win")return;
    if(isDailyGame&&screen==="over")return; // no save on daily fail - no retries
    if(!puzzle||!board||!notes||!given)return;
    const data={
      difficulty,puzzle,solution,board,
      notes:notes.map(r=>r.map(s=>[...s])),
      given,lives,time,
      errors:[...errors],
      selected,highlightedCells:highlightedKeys,noteMode,screen,
      isDailyGame:!!isDailyGame,
      ...(isDailyGame&&{dailyDate:getTodayUTC()}),
    };
    localStorage.setItem(SAVE_KEY,JSON.stringify(data));
  }

  function loadGame(){
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw)return false;
    try{
      const data=JSON.parse(raw);
      if(data.isDailyGame&&data.dailyDate!==getTodayUTC()){
        localStorage.removeItem(SAVE_KEY);
        setHasSave(false);
        return false;
      }
      setDifficulty(data.difficulty);
      setPuzzle(data.puzzle);
      setSolution(data.solution);
      setBoard(data.board);
      setNotes(data.notes.map(r=>r.map(s=>new Set(s))));
      setGiven(data.given);
      setLives(data.lives);
      setTime(data.time);
      setErrors(new Set(data.errors||[]));
      setSelected(data.selected);
      setHighlightedKeys(Array.isArray(data.highlightedCells)&&data.highlightedCells.length>0
        ?data.highlightedCells
        :data.selected&&Array.isArray(data.selected)
          ?[`${data.selected[0]},${data.selected[1]}`]
          :[]);
      setNoteMode(data.noteMode);
      setIsDailyGame(!!data.isDailyGame);
      setScreen(data.screen||"game");
      setReviewFrom(null);
      if(data.screen==="game")startTimer();
      return true;
    }catch{ return false; }
  }

  useEffect(()=>{
    const raw=localStorage.getItem(SAVE_KEY);
    if(raw){
      try{
        const data=JSON.parse(raw);
        if(data.isDailyGame&&data.dailyDate!==getTodayUTC()){
          localStorage.removeItem(SAVE_KEY);
        }
      }catch{ /* keep save on parse error */ }
    }
    setHasSave(!!localStorage.getItem(SAVE_KEY));

    async function initAuthAndCloud() {
      if (!electronAPI) {
        setDailyCompleted(getDailyCompleted());
        return;
      }
      try {
        const u = await electronAPI.getUser();
        setUser(u);
        if (u) {
          const today = getTodayUTC();
          const cloud = await electronAPI.getDailyCompletion(today);
          if (cloud && cloud.date === today) {
            setDailyCompleted({ date: cloud.date, difficulty: cloud.difficulty, time: cloud.time });
          } else {
            setDailyCompleted(null);
          }
          const lb = await electronAPI.getLeaderboard(today);
          if (lb && lb.leaderboard) setLeaderboard(lb.leaderboard);
        } else {
          setDailyCompleted(null);
        }
      } catch { setDailyCompleted(null); }
    }
    initAuthAndCloud();
  },[]);

  useEffect(()=>{
    if (screen==='game'&&user&&electronAPI) {
      electronAPI.getLeaderboard(getTodayUTC()).then(lb=>{
        if (lb&&lb.leaderboard) setLeaderboard(lb.leaderboard);
      }).catch(()=>{});
    }
  },[screen,user]);

  useEffect(()=>{
    if((screen==="game"||screen==="over"||screen==="win")&&puzzle&&board&&notes&&given){
      saveGame();
    }
  },[screen,puzzle,board,notes,given,lives,time,errors,selected,highlightedKeys,noteMode,isDailyGame]);

  useEffect(()=>{
    if(screen!=='game')return;
    const updateScale=()=>{
      const w=window.innerWidth;
      const h=window.innerHeight;
      const naturalW=720;
      const naturalH=680;
      const scale=Math.min(w/naturalW,h/naturalH,1.5);
      setGameScale(Math.max(0.5,scale));
    };
    updateScale();
    window.addEventListener('resize',updateScale);
    return()=>window.removeEventListener('resize',updateScale);
  },[screen]);

  function beginCellPaintFromEvent(r,c,e){
    if(e.button!==0)return;
    paintSelectRef.current=true;
    const k=`${r},${c}`;
    setHighlightedKeys([k]);
    setSelected([r,c]);
  }
  function extendCellPaint(r,c){
    if(!paintSelectRef.current)return;
    const k=`${r},${c}`;
    setHighlightedKeys(prev=>prev.includes(k)?prev:[...prev,k]);
    setSelected([r,c]);
  }

  useEffect(()=>{
    function endPaint(){paintSelectRef.current=false;}
    window.addEventListener('mouseup',endPaint);
    return()=>window.removeEventListener('mouseup',endPaint);
  },[]);

  function handleNum(n,cellOverride){
    if(!board||!solution)return;

    if(noteMode){
      const keys=cellOverride!=null
        ?[`${cellOverride[0]},${cellOverride[1]}`]
        :highlightedKeys.length>0
          ?[...highlightedKeys]
          :selected
            ?[`${selected[0]},${selected[1]}`]
            :[];
      if(keys.length===0)return;
      if(errors&&errors.size>0){
        const newBoard=board.map(row=>[...row]);
        for(const key of errors){ const [er,ec]=key.split(',').map(Number); newBoard[er][ec]=0; }
        setBoard(newBoard);
        setErrors(new Set());
      }
      setNotes(prev=>{
        const next=prev.map(row=>row.map(s=>new Set(s)));
        for(const key of keys){
          const [r,c]=key.split(',').map(Number);
          if(given[r][c])continue;
          if(board[r][c]!==0&&solution[r][c]===board[r][c])continue;
          if(next[r][c].has(n))next[r][c].delete(n);
          else next[r][c].add(n);
        }
        return next;
      });
      return;
    }

    const target=cellOverride??selected;
    if(!target)return;
    const [r,c]=target;
    if(given[r][c])return;
    // Correct guesses can't be changed
    if(board[r][c]!==0&&solution[r][c]===board[r][c])return;
    // place guess - clear any previous incorrect guesses when making a new guess anywhere
    const correct=solution[r][c]===n;
    const newBoard=board.map(row=>[...row]);
    if(errors&&errors.size>0){
      for(const key of errors){ const [er,ec]=key.split(',').map(Number); newBoard[er][ec]=0; }
      setErrors(new Set());
    }
    newBoard[r][c]=n;
    setBoard(newBoard);
    // clear notes for this cell; if correct, also remove n from notes in same row/col/box
    setNotes(prev=>{
      const next=prev.map(row=>row.map(s=>new Set(s)));
      next[r][c]=new Set();
      if(correct){
        const br=Math.floor(r/3)*3,bc=Math.floor(c/3)*3;
        for(let i=0;i<9;i++){next[r][i].delete(n);next[i][c].delete(n);}
        for(let i=0;i<3;i++)for(let j=0;j<3;j++)next[br+i][bc+j].delete(n);
      }
      return next;
    });
    if(!correct){
      playWrong();
      setLastGuess({r,c,correct:false});
      setTimeout(()=>setLastGuess(null),400);
      setErrors(new Set([`${r},${c}`]));
      const newLives=lives-1;
      setLives(newLives);
      if(newLives<=0){
        stopTimer();
        if(isDailyGame){ localStorage.removeItem(SAVE_KEY); setHasSave(false); }
        setScreen("over");return;
      }
    } else {
      playCorrect();
      setLastGuess({r,c,correct:true});
      setTimeout(()=>setLastGuess(null),350);
      setErrors(prev=>{const s=new Set(prev);s.delete(`${r},${c}`);return s;});
      // check win
      const allFilled=newBoard.every((row,ri)=>row.every((v,ci)=>v===solution[ri][ci]));
      if(allFilled){
        stopTimer();
        playVictory();
        const newRec=saveRecord(difficulty,time);
        setIsNewRecord(newRec);
        if(isDailyGame){
          saveDailyCompleted(difficulty,time);
          if(electronAPI&&user){
            electronAPI.saveDailyCompletion({
              date:getTodayUTC(),
              difficulty,
              time,
              nickname:user.nickname||user.name||'',
              lives,
            }).then(async ()=>{
              const lb = await electronAPI.getLeaderboard(getTodayUTC());
              if (lb && lb.leaderboard) setLeaderboard(lb.leaderboard);
            }).catch(()=>{});
          }
        }
        setScreen("win");
      }
    }
  }

  useEffect(()=>{
    function onKey(e){
      if(screen!=="game")return;
      if(paused){ if(e.key==='Escape'){ e.preventDefault(); setPaused(false); startTimer(); } return; }
      if(e.key==='Escape'){ e.preventDefault(); setPaused(true); stopTimer(); return; }
      if(e.key>='1'&&e.key<='9')handleNum(parseInt(e.key));
      if(e.key===' '||e.key==='n'||e.key==='N'){e.preventDefault();setNoteMode(m=>!m);}
      if(!selected)return;
      const [r,c]=selected;
      const step=e.shiftKey?3:1;
      const moveTo=(nr,nc)=>{setSelected([nr,nc]);setHighlightedKeys([`${nr},${nc}`]);};
      if((e.key==='ArrowUp'||e.key==='w'||e.key==='W')&&r>0){e.preventDefault();moveTo(Math.max(0,r-step),c);}
      if((e.key==='ArrowDown'||e.key==='s'||e.key==='S')&&r<8){e.preventDefault();moveTo(Math.min(8,r+step),c);}
      if((e.key==='ArrowLeft'||e.key==='a'||e.key==='A')&&c>0){e.preventDefault();moveTo(r,Math.max(0,c-step));}
      if((e.key==='ArrowRight'||e.key==='d'||e.key==='D')&&c<8){e.preventDefault();moveTo(r,Math.min(8,c+step));}
    }
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  });

  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  async function handleLogin() {
    if (!electronAPI) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const u = await electronAPI.login();
      setUser(u);
      const today = getTodayUTC();
      const cloud = await electronAPI.getDailyCompletion(today);
      setDailyCompleted(cloud && cloud.date === today ? { date: cloud.date, difficulty: cloud.difficulty, time: cloud.time } : null);
      const lb = await electronAPI.getLeaderboard(today);
      if (lb && lb.leaderboard) setLeaderboard(lb.leaderboard);
    } catch (e) {
      setLoginError(e?.message || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    if (!electronAPI) return;
    electronAPI.logout();
    setUser(null);
    setLeaderboard(null);
  }

  // ── styles ──
  const palette={
    bg:'#0f0e17',
    surface:'#1a1828',
    card:'#22203a',
    accent:'#e8c547',
    accentSoft:'rgba(232,197,71,0.15)',
    text:'#fffffe',
    sub:'#a7a9be',
    given:'#fffffe',
    user:'#e8c547',
    error:'#ff6b6b',
    selected:'rgba(232,197,71,0.22)',
    relatedBg:'rgba(232,197,71,0.07)',
    notecol:'#7c7a96',
    border:'rgba(255,255,255,0.08)',
    boxBorder:'rgba(255,255,255,0.25)',
  };

  const cellStyle=(r,c)=>{
    const key=`${r},${c}`;
    const inHighlight=highlightedKeys.includes(key);
    const focusSel=selected&&selected[0]===r&&selected[1]===c;
    const dropHi=dropTarget&&dropTarget[0]===r&&dropTarget[1]===c;
    const related=selected&&(selected[0]===r||selected[1]===c||
      (Math.floor(selected[0]/3)===Math.floor(r/3)&&Math.floor(selected[1]/3)===Math.floor(c/3)));
    const isErr=errors&&errors.has(key);
    const sameVal=selected&&board&&board[selected[0]][selected[1]]!==0&&
      board[r][c]===board[selected[0]][selected[1]]&&!focusSel;
    return{
      width:52,height:52,display:'flex',alignItems:'center',justifyContent:'center',
      position:'relative',cursor:'pointer',userSelect:'none',
      background:dropHi?'rgba(232,197,71,0.38)':inHighlight?palette.selected:sameVal?'rgba(232,197,71,0.12)':related?palette.relatedBg:'transparent',
      borderRight:((c+1)%3===0&&c!==8)?`2px solid ${palette.boxBorder}`:`1px solid ${palette.border}`,
      borderBottom:((r+1)%3===0&&r!==8)?`2px solid ${palette.boxBorder}`:`1px solid ${palette.border}`,
      borderLeft:c===0?`2px solid ${palette.boxBorder}`:'none',
      borderTop:r===0?`2px solid ${palette.boxBorder}`:'none',
      fontSize:22,fontWeight:given&&given[r][c]?700:500,
      color:isErr?palette.error:given&&given[r][c]?palette.given:palette.user,
      fontFamily:"'Crimson Pro', Georgia, serif",
      transition:'background 0.12s',
    };
  };

  // ── Screens ──
  if(screen==="menu") return (
    <div style={{minHeight:'100vh',background:palette.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Crimson Pro',Georgia,serif",color:palette.text,position:'relative'}}>
      {electronAPI && (
        <div style={{position:'absolute',top:16,right:16,display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>electronAPI.quit()} style={{
            padding:'6px 14px',borderRadius:4,border:`1px solid ${palette.border}`,background:'transparent',color:palette.sub,
            cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:13,
          }}>Quit</button>
          {user ? (
            <>
              <span style={{color:palette.sub,fontSize:14}}>Hi, {user.nickname || user.name || user.email}</span>
              <button onClick={handleLogout} style={{
                padding:'6px 14px',borderRadius:4,border:`1px solid ${palette.border}`,background:'transparent',color:palette.sub,
                cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:13,
              }}>Logout</button>
            </>
          ) : (
            <button onClick={handleLogin} disabled={loginLoading} style={{
              padding:'6px 14px',borderRadius:4,border:`1px solid ${palette.accent}`,background:palette.accentSoft,color:palette.accent,
              cursor:loginLoading?'not-allowed':'pointer',fontFamily:"'Crimson Pro',serif",fontSize:13,opacity:loginLoading?0.7:1,
            }}>{loginLoading?'Logging in...':'Login'}</button>
          )}
        </div>
      )}
      <div style={{textAlign:'center',maxWidth:420,padding:'0 24px'}}>
        {loginError && (
          <div style={{marginBottom:16,padding:'8px 16px',borderRadius:4,background:'rgba(255,107,107,0.15)',color:'#ff6b6b',fontSize:14}}>
            {loginError}
          </div>
        )}
        <div style={{fontSize:72,letterSpacing:-2,fontFamily:"'Playfair Display',serif",fontWeight:900,lineHeight:1,color:palette.accent}}>数独</div>
        <div style={{fontSize:36,fontFamily:"'Playfair Display',serif",fontWeight:700,marginBottom:8}}>SUDOKU</div>
        <div style={{color:palette.sub,marginBottom:48,fontSize:16}}>A classic puzzle. Five lives. One timer.</div>

        <div style={{marginBottom:32}}>
          <div style={{fontSize:13,letterSpacing:3,color:palette.sub,marginBottom:16,textTransform:'uppercase'}}>Difficulty</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:12,justifyContent:'center'}}>
            {['easy','medium','hard','impossible'].map(d=>(
              <button key={d} onClick={()=>setDifficulty(d)} style={{
                padding:'10px 24px',borderRadius:4,border:`2px solid ${difficulty===d?palette.accent:palette.border}`,
                background:difficulty===d?palette.accentSoft:'transparent',
                color:difficulty===d?palette.accent:palette.sub,cursor:'pointer',
                fontFamily:"'Crimson Pro',serif",fontSize:16,fontWeight:600,
                textTransform:'capitalize',transition:'all 0.2s',letterSpacing:1,
              }}>{d}</button>
            ))}
          </div>
        </div>

        {dailyCompleted&&(
          <div style={{
            marginBottom:24,padding:'12px 20px',borderRadius:6,background:palette.accentSoft,
            border:`1px solid ${palette.accent}`,color:palette.accent,fontSize:15,
            display:'flex',alignItems:'center',gap:8,justifyContent:'center',flexWrap:'wrap',
          }}>
            <span style={{fontWeight:700}}>✓ Today&apos;s daily completed!</span>
            <span style={{color:palette.sub}}>•</span>
            <span style={{textTransform:'capitalize'}}>{dailyCompleted.difficulty}</span>
            <span style={{color:palette.sub}}>•</span>
            <span>{`${String(Math.floor(dailyCompleted.time/60)).padStart(2,'0')}:${String(dailyCompleted.time%60).padStart(2,'0')}`}</span>
          </div>
        )}

        <div style={{display:'flex',flexDirection:'column',gap:12,alignItems:'center'}}>
          {hasSave&&(
            <button onClick={loadGame} style={{
              padding:'14px 48px',borderRadius:4,border:`2px solid ${palette.accent}`,background:'transparent',color:palette.accent,
              cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:18,fontWeight:600,
              transition:'all 0.2s',
            }}>Continue</button>
          )}
          <button onClick={async ()=>{
            if(electronAPI&&!user){ handleLogin(); return; }
            if(electronAPI&&user){
              setDailyClickLoading(true);
              try {
                const today=getTodayUTC();
                const cloud=await electronAPI.getDailyCompletion(today);
                if(cloud&&cloud.date===today){
                  setDailyCompleted({ date: cloud.date, difficulty: cloud.difficulty, time: cloud.time });
                  setDailyModalMode('completed'); setShowDailyConfirm(true);
                  setDailyClickLoading(false); return;
                }
                setDailyCompleted(null);
              }catch{ setDailyCompleted(null); }
              setDailyClickLoading(false);
            }
            if(dailyCompleted){ setDailyModalMode('completed'); setShowDailyConfirm(true); return; }
            const raw=localStorage.getItem(SAVE_KEY);
            if(raw){ try{ const d=JSON.parse(raw); if(d.isDailyGame&&d.dailyDate===getTodayUTC()){ setDailyModalMode('inprogress'); setShowDailyConfirm(true); return; } }catch{} }
            setDailyModalMode('confirm'); setShowDailyConfirm(true);
          }} disabled={dailyClickLoading} style={{
            padding:'16px 64px',borderRadius:4,border:`2px solid ${palette.accent}`,
            background:palette.accent,color:palette.bg,cursor:dailyClickLoading?'not-allowed':'pointer',
            fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,letterSpacing:2,
            transition:'all 0.2s',opacity:dailyClickLoading?0.7:1,
          }}>{dailyClickLoading?'...':'Daily Puzzle'}</button>
          <button onClick={startGame} style={{
            padding:'14px 48px',borderRadius:4,border:`2px solid ${palette.border}`,
            background:'transparent',color:palette.sub,cursor:'pointer',
            fontFamily:"'Crimson Pro',serif",fontSize:16,fontWeight:600,
            transition:'all 0.2s',
          }}>Free Play</button>
        </div>

        {user && (
          <div style={{marginTop:32,marginBottom:24}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div style={{fontSize:13,letterSpacing:3,color:palette.sub,textTransform:'uppercase'}}>Today&apos;s Leaderboard</div>
              <button onClick={refreshLeaderboard} disabled={leaderboardLoading} style={{
                padding:'4px 10px',borderRadius:4,border:`1px solid ${palette.border}`,background:'transparent',color:palette.sub,
                cursor:leaderboardLoading?'not-allowed':'pointer',fontFamily:"'Crimson Pro',serif",fontSize:12,opacity:leaderboardLoading?0.6:1,
              }}>{leaderboardLoading?'...':'Refresh'}</button>
            </div>
            <div style={{background:palette.card,borderRadius:6,border:`1px solid ${palette.border}`,overflow:'hidden',maxHeight:200,overflowY:'auto'}}>
              {leaderboard === null ? (
                <div style={{padding:20,color:palette.sub,fontSize:14,textAlign:'center'}}>Loading...</div>
              ) : leaderboard.length === 0 ? (
                <div style={{padding:20,color:palette.sub,fontSize:14,textAlign:'center'}}>No completions yet today. Be the first!</div>
              ) : leaderboard.map((entry,i)=>(
                <div key={i} style={{
                  display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',
                  borderBottom:i<leaderboard.length-1?`1px solid ${palette.border}`:'none',
                  fontFamily:"'Crimson Pro',serif",fontSize:15,
                }}>
                  <span style={{display:'flex',alignItems:'center',gap:6,minWidth:0,flex:1}}>
                    <span style={{color:palette.accent,fontWeight:700,minWidth:20}}>#{i+1}</span>
                    <span style={{color:palette.text,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{entry.nickname}</span>
                    <span style={{color:palette.sub,fontSize:12,textTransform:'capitalize',minWidth:56}}>{entry.difficulty}</span>
                    <span style={{color:'#ff6b6b',fontSize:14,minWidth:48}}>{entry.lives != null ? '♥'.repeat(Math.max(0,entry.lives)) : ''}</span>
                  </span>
                  <span style={{color:palette.accent,fontWeight:600,flexShrink:0}}>{`${String(Math.floor(entry.time/60)).padStart(2,'0')}:${String(entry.time%60).padStart(2,'0')}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{marginTop:48,color:palette.sub,fontSize:14,lineHeight:1.8}}>
          <div>Click a cell → tap a number to fill, or drag a number onto the grid</div>
          <div>Click and drag across cells to highlight many; in note mode, a digit toggles that note in every highlighted cell</div>
          <div>Press <kbd style={{background:palette.card,padding:'1px 6px',borderRadius:3,color:palette.text}}>Space</kbd> or <kbd style={{background:palette.card,padding:'1px 6px',borderRadius:3,color:palette.text}}>N</kbd> to toggle note mode</div>
          <div><kbd style={{background:palette.card,padding:'1px 6px',borderRadius:3,color:palette.text}}>↑↓←→</kbd> or <kbd style={{background:palette.card,padding:'1px 6px',borderRadius:3,color:palette.text}}>WASD</kbd> to navigate</div>
          <div><kbd style={{background:palette.card,padding:'1px 6px',borderRadius:3,color:palette.text}}>Shift</kbd> + arrow/WASD to jump 3 squares</div>
        </div>
      </div>

      {showDailyConfirm&&(
        <div style={{
          position:'fixed',inset:0,background:'rgba(15,14,23,0.9)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',
          display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,fontFamily:"'Crimson Pro',Georgia,serif",
        }}>
          <div style={{
            background:palette.card,borderRadius:8,border:`1px solid ${palette.border}`,
            padding:28,maxWidth:360,boxShadow:'0 16px 48px rgba(0,0,0,0.5)',
          }}>
            {dailyModalMode==='completed'?(
              <>
                <div style={{fontSize:22,fontWeight:700,color:palette.accent,marginBottom:16,fontFamily:"'Playfair Display',serif"}}>Daily Puzzle</div>
                <div style={{color:palette.sub,fontSize:15,lineHeight:1.6,marginBottom:20}}>
                  <p style={{marginBottom:12}}>You&apos;ve already completed today&apos;s daily puzzle!</p>
                  <p style={{color:palette.accent,fontWeight:600}}><span style={{textTransform:'capitalize'}}>{dailyCompleted.difficulty}</span> • {`${String(Math.floor(dailyCompleted.time/60)).padStart(2,'0')}:${String(dailyCompleted.time%60).padStart(2,'0')}`}</p>
                </div>
                <div style={{display:'flex',justifyContent:'flex-end'}}>
                  <button onClick={()=>setShowDailyConfirm(false)} style={{
                    padding:'10px 24px',borderRadius:4,border:`2px solid ${palette.accent}`,background:palette.accent,color:palette.bg,
                    cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14,fontWeight:600,
                  }}>Close</button>
                </div>
              </>
            ):dailyModalMode==='inprogress'?(
              <>
                <div style={{fontSize:22,fontWeight:700,color:palette.accent,marginBottom:16,fontFamily:"'Playfair Display',serif"}}>Daily Puzzle</div>
                <div style={{color:palette.sub,fontSize:15,lineHeight:1.6,marginBottom:20}}>
                  <p style={{marginBottom:12}}>You have today&apos;s daily puzzle in progress. Use Continue to resume.</p>
                </div>
                <div style={{display:'flex',justifyContent:'flex-end'}}>
                  <button onClick={()=>setShowDailyConfirm(false)} style={{
                    padding:'10px 24px',borderRadius:4,border:`2px solid ${palette.accent}`,background:palette.accent,color:palette.bg,
                    cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14,fontWeight:600,
                  }}>Close</button>
                </div>
              </>
            ):(
              <>
                <div style={{fontSize:22,fontWeight:700,color:palette.accent,marginBottom:16,fontFamily:"'Playfair Display',serif"}}>Daily Puzzle</div>
                <div style={{color:palette.sub,fontSize:15,lineHeight:1.6,marginBottom:20}}>
                  <p style={{marginBottom:12}}>One puzzle per day, shared by everyone. Pick your difficulty—the same puzzle with more or fewer givens.</p>
                  <p style={{marginBottom:12}}><strong style={{color:palette.text}}>No restarts.</strong> Once you start, you must finish or abandon. Choose carefully.</p>
                  <p style={{color:palette.accent,fontWeight:600}}>Difficulty: <span style={{textTransform:'capitalize'}}>{difficulty}</span></p>
                </div>
                <div style={{display:'flex',gap:12,justifyContent:'flex-end'}}>
                  <button onClick={()=>setShowDailyConfirm(false)} style={{
                    padding:'10px 24px',borderRadius:4,border:`1px solid ${palette.border}`,background:'transparent',color:palette.sub,
                    cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14,
                  }}>Back</button>
                  <button onClick={()=>{setShowDailyConfirm(false);startDailyGame();}} style={{
                    padding:'10px 24px',borderRadius:4,border:`2px solid ${palette.accent}`,background:palette.accent,color:palette.bg,
                    cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14,fontWeight:600,
                  }}>Start</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if(screen==="over"||screen==="win") return (
    <div style={{minHeight:'100vh',background:palette.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Crimson Pro',Georgia,serif",color:palette.text,position:'relative',overflow:'hidden'}}>
      <style>{`
        @keyframes firework-burst {
          0% { transform: translate(0,0) scale(0); opacity: 1; }
          100% { transform: var(--tx) scale(1); opacity: 0; }
        }
        @keyframes banner-slide {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.08); opacity: 1; }
          70% { transform: scale(0.95); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes over-fade {
          0% { opacity: 0; }
          100% { opacity: 0.4; }
        }
        .fw-particle { animation: firework-burst 1.2s ease-out forwards; }
        .fw-banner, .over-banner { animation: banner-slide 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .over-vignette { animation: over-fade 0.8s ease-out forwards; }
      `}</style>
      {screen==="win"&&(
        <>
          <div style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden'}}>
            {[
              {x:20,y:25,c:'#e8c547'},
              {x:80,y:20,c:'#ff9f43'},
              {x:50,y:15,c:'#e8c547'},
              {x:15,y:70,c:'#ff6b6b'},
              {x:85,y:75,c:'#e8c547'},
              {x:50,y:85,c:'#ff9f43'},
              {x:75,y:45,c:'#fffffe'},
              {x:25,y:55,c:'#ff9f43'},
            ].map((f,i)=>(
              <div key={i} style={{position:'absolute',left:`${f.x}%`,top:`${f.y}%`,width:4,height:4}}>
                {[...Array(16)].map((_,j)=>{
                  const rad=(j*22.5)*Math.PI/180;
                  const tx=`translate(${Math.cos(rad)*100}px, ${Math.sin(rad)*100}px)`;
                  return (
                    <div key={j} className="fw-particle" style={{
                      position:'absolute',left:'-3px',top:'-3px',width:6,height:6,borderRadius:'50%',background:f.c,
                      boxShadow:`0 0 8px ${f.c}`,
                      '--tx':tx,animationDelay:`${i*0.15}s`,
                    }}/>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="fw-banner" style={{
            position:'relative',zIndex:1,
            padding:'20px 56px',marginBottom:24,
            background:`linear-gradient(135deg, ${palette.accent} 0%, #d4a83a 50%, ${palette.accent} 100%)`,
            boxShadow:'0 8px 32px rgba(232,197,71,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
            borderRadius:4,border:'2px solid rgba(255,255,255,0.25)',
            transformOrigin:'center',
          }}>
            <div style={{fontSize:42,fontFamily:"'Playfair Display',serif",fontWeight:900,color:palette.bg,letterSpacing:4,textShadow:'0 2px 4px rgba(0,0,0,0.2)'}}>SOLVED!</div>
          </div>
          {isNewRecord&&(
            <div className="fw-banner" style={{
              position:'relative',zIndex:1,marginTop:-16,marginBottom:24,
              padding:'12px 32px',background:'linear-gradient(135deg, #ffd700 0%, #ffb347 50%, #ffd700 100%)',
              boxShadow:'0 4px 24px rgba(255,215,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
              borderRadius:4,border:'2px solid rgba(255,255,255,0.4)',animation:'new-record-pulse 1.5s ease-in-out infinite',
            }}>
              <style>{`@keyframes new-record-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.02);opacity:0.95}}`}</style>
              <div style={{fontSize:24,fontFamily:"'Playfair Display',serif",fontWeight:800,color:'#1a1828',letterSpacing:3}}>★ NEW RECORD ★</div>
            </div>
          )}
        </>
      )}
      {screen==="over"&&(
        <>
          <div className="over-vignette" style={{
            position:'absolute',inset:0,pointerEvents:'none',
            background:'radial-gradient(ellipse at center, transparent 40%, rgba(255,107,107,0.15) 100%)',
          }}/>
          <div className="over-banner" style={{
            position:'relative',zIndex:1,
            padding:'20px 48px',marginBottom:24,
            background:`linear-gradient(135deg, #c0392b 0%, #8b1a1a 50%, #5c0a0a 100%)`,
            boxShadow:'0 8px 32px rgba(192,57,43,0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
            borderRadius:4,border:'2px solid rgba(255,255,255,0.15)',
            transformOrigin:'center',
          }}>
            <div style={{fontSize:42,fontFamily:"'Playfair Display',serif",fontWeight:900,color:'#fffffe',letterSpacing:4,textShadow:'0 2px 8px rgba(0,0,0,0.5)'}}>GAME OVER</div>
          </div>
        </>
      )}
      <div style={{textAlign:'center',position:'relative',zIndex:1}}>
        {!reviewFrom?(
          <>
            <div style={{color:palette.sub,fontSize:18,marginTop:0}}>Time: {fmt(time)}{isNewRecord&&<span style={{color:palette.accent,marginLeft:8}}>★</span>}</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:40,justifyContent:'center'}}>
              {!isDailyGame&&<button onClick={startGame} style={{padding:'14px 40px',borderRadius:4,border:`2px solid ${palette.accent}`,background:palette.accent,color:palette.bg,cursor:'pointer',fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700}}>Play Again</button>}
              <button onClick={()=>setReviewFrom(screen)} style={{padding:'14px 40px',borderRadius:4,border:`2px solid ${palette.border}`,background:'transparent',color:palette.sub,cursor:'pointer',fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700}}>Review Board</button>
              <button onClick={async ()=>{stopTimer();localStorage.removeItem(SAVE_KEY);setHasSave(false);setScreen("menu");setReviewFrom(null);
                if(electronAPI&&user){ try{ const cloud=await electronAPI.getDailyCompletion(getTodayUTC()); setDailyCompleted(cloud&&cloud.date===getTodayUTC()?{ date: cloud.date, difficulty: cloud.difficulty, time: cloud.time }:null); }catch{ setDailyCompleted(null); } }
                else{ setDailyCompleted(getDailyCompleted()); }
              }} style={{padding:'14px 40px',borderRadius:4,border:`2px solid ${palette.border}`,background:'transparent',color:palette.sub,cursor:'pointer',fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700}}>Menu</button>
            </div>
          </>
        ):(
          <div style={{marginTop:24}}>
            <div style={{color:palette.sub,fontSize:16,marginBottom:16}}>Time: {fmt(time)}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(9,52px)',borderRadius:6,overflow:'hidden',boxShadow:'0 8px 48px rgba(0,0,0,0.6)',margin:'0 auto 20px'}}>
              {board&&board.map((row,r)=>row.map((val,c)=>{
                const isErr=errors&&errors.has(`${r},${c}`);
                return(
                  <div key={`${r},${c}`} style={{
                    width:52,height:52,display:'flex',alignItems:'center',justifyContent:'center',
                    borderRight:((c+1)%3===0&&c!==8)?`2px solid ${palette.boxBorder}`:`1px solid ${palette.border}`,
                    borderBottom:((r+1)%3===0&&r!==8)?`2px solid ${palette.boxBorder}`:`1px solid ${palette.border}`,
                    borderLeft:c===0?`2px solid ${palette.boxBorder}`:'none',
                    borderTop:r===0?`2px solid ${palette.boxBorder}`:'none',
                    fontSize:22,fontWeight:given&&given[r][c]?700:500,
                    color:isErr?palette.error:given&&given[r][c]?palette.given:palette.user,
                    fontFamily:"'Crimson Pro', Georgia, serif",background:palette.card,
                  }}>
                    {val!==0?<span>{val}</span>:<span style={{color:palette.notecol}}>·</span>}
                  </div>
                );
              }))}
            </div>
            <button onClick={()=>setReviewFrom(null)} style={{padding:'12px 32px',borderRadius:4,border:`1px solid ${palette.border}`,background:'transparent',color:palette.sub,cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:16}}>Back</button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Game screen ──
  return (
    <div style={{position:'fixed',inset:0,background:palette.bg,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',fontFamily:"'Crimson Pro',Georgia,serif",color:palette.text}}>
      <div style={{transform:`scale(${gameScale})`,transformOrigin:'center center',display:'flex',flexDirection:'row',alignItems:'flex-start',justifyContent:'center',padding:'20px',gap:48}}>
      {/* Main game area - centered */}
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start'}}>
      <style>{`
        .num-btn:hover{background:rgba(232,197,71,0.2)!important;}
        .num-btn-draggable{cursor:grab;}
        .num-btn-draggable:active{cursor:grabbing;}
        @keyframes cell-shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes cell-lock {
          0% { transform: scale(1); }
          30% { transform: scale(0.88); }
          55% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        @keyframes notes-glow {
          0%, 100% { box-shadow: 0 0 24px rgba(232,197,71,0.35), 0 0 48px rgba(232,197,71,0.18); }
          50% { box-shadow: 0 0 32px rgba(232,197,71,0.5), 0 0 64px rgba(232,197,71,0.25); }
        }
        .cell-shake { animation: cell-shake 0.4s ease-out; }
        .cell-lock { animation: cell-lock 0.35s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:468,marginBottom:20}}>
        <div style={{display:'flex',gap:4}}>
          {HEARTS.map((_,i)=>(
            <span key={i} style={{fontSize:22,color:i<lives?'#ff6b6b':'rgba(255,107,107,0.2)',transition:'color 0.3s'}}>♥</span>
          ))}
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:11,letterSpacing:3,color:palette.sub,textTransform:'uppercase'}}>{isDailyGame?'Daily · ':''}{difficulty}</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:22,color:palette.accent}}>{fmt(time)}</div>
        </div>
        <button onClick={()=>{setPaused(true);stopTimer();}} style={{background:'transparent',border:`1px solid ${palette.border}`,color:palette.sub,padding:'6px 14px',borderRadius:4,cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14}} title="Pause">Pause</button>
      </div>

      {/* Pause overlay */}
      {paused&&(
        <div style={{
          position:'fixed',inset:0,background:'rgba(15,14,23,0.92)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',
          display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,fontFamily:"'Crimson Pro',Georgia,serif",
        }}>
          <div style={{
            background:palette.card,borderRadius:8,border:`1px solid ${palette.border}`,
            padding:32,minWidth:260,textAlign:'center',boxShadow:'0 16px 48px rgba(0,0,0,0.5)',
          }}>
            <div style={{fontSize:24,fontWeight:700,color:palette.accent,marginBottom:24,fontFamily:"'Playfair Display',serif"}}>Paused</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <button onClick={()=>{setPaused(false);startTimer();}} style={{
                padding:'12px 28px',borderRadius:4,border:`2px solid ${palette.accent}`,background:palette.accent,color:palette.bg,
                cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:16,fontWeight:600,
              }}>Resume</button>
              {!isDailyGame&&(
                <button onClick={()=>{stopTimer();setPaused(false);startGame();}} style={{
                  padding:'12px 28px',borderRadius:4,border:`2px solid ${palette.accent}`,background:'transparent',color:palette.accent,
                  cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14,fontWeight:600,
                }}>Restart</button>
              )}
              <button onClick={()=>{stopTimer();setPaused(false);setScreen("menu");setHasSave(!!localStorage.getItem(SAVE_KEY));}} style={{
                padding:'12px 28px',borderRadius:4,border:`1px solid ${palette.border}`,background:'transparent',color:palette.sub,
                cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14,
              }}>Menu</button>
              {electronAPI&&(
                <button onClick={()=>{
                  saveGame();
                  setHasSave(!!localStorage.getItem(SAVE_KEY));
                  stopTimer();
                  electronAPI.quit();
                }} style={{
                  padding:'12px 28px',borderRadius:4,border:`2px solid ${palette.error}`,background:'rgba(255,107,107,0.14)',color:palette.error,
                  cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14,fontWeight:600,
                }}>Quit game</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Board */}
      <div style={{
        position:'relative',
        borderRadius:6,
        ...(noteMode&&{
          boxShadow:'0 0 24px rgba(232,197,71,0.35), 0 0 48px rgba(232,197,71,0.18)',
          animation:'notes-glow 2.5s ease-in-out infinite',
        }),
      }}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(9,52px)',borderRadius:6,overflow:'hidden',boxShadow:'0 8px 48px rgba(0,0,0,0.6)'}}>
        {board&&board.map((row,r)=>row.map((val,c)=>{
          const noteSet=notes[r][c];
          const anim=lastGuess&&lastGuess.r===r&&lastGuess.c===c?(lastGuess.correct?'cell-lock':'cell-shake'):'';
          return(
            <div
              key={`${r},${c}`}
              className={anim}
              style={{...cellStyle(r,c),transformOrigin:'center'}}
              onMouseDown={e=>beginCellPaintFromEvent(r,c,e)}
              onMouseEnter={()=>extendCellPaint(r,c)}
              onDragOver={(e)=>{e.preventDefault();e.dataTransfer.dropEffect='copy';setDropTarget([r,c]);}}
              onDragLeave={(e)=>{
                const next=e.relatedTarget;
                if(next instanceof Node&&e.currentTarget.contains(next))return;
                setDropTarget(t=>t&&t[0]===r&&t[1]===c?null:t);
              }}
              onDrop={(e)=>{
                e.preventDefault();
                setDropTarget(null);
                const raw=e.dataTransfer.getData('text/plain');
                const n=parseInt(raw,10);
                if(n>=1&&n<=9){
                  const k=`${r},${c}`;
                  setSelected([r,c]);
                  setHighlightedKeys([k]);
                  handleNum(n,[r,c]);
                }
              }}
            >
              {val!==0?(
                <span style={{pointerEvents:'none'}}>{val}</span>
              ):(
                <div style={{position:'relative',width:'100%',height:'100%',padding:2,boxSizing:'border-box',pointerEvents:'none'}}>
                  {[1,2,3,4,5,6,7,8,9].map(n=>{
                    const i=n-1;
                    const col=i%3;
                    const row=Math.floor(i/3);
                    return(
                      <span
                        key={n}
                        style={{
                          position:'absolute',
                          left:`${col*(100/3)}%`,
                          top:`${row*(100/3)}%`,
                          width:`${100/3}%`,
                          height:`${100/3}%`,
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'center',
                          fontSize:9,
                          color:palette.notecol,
                          fontWeight:600,
                          lineHeight:1,
                        }}
                      >
                        {noteSet.has(n)?n:''}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }))}
        </div>
      </div>

      {/* Controls */}
      <div style={{marginTop:20,display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        {/* Number pad */}
        <div style={{display:'flex',gap:8}}>
          {[1,2,3,4,5,6,7,8,9].map(n=>(
            <button
              key={n}
              type="button"
              draggable
              className="num-btn num-btn-draggable"
              title="Click after selecting a cell, or drag onto the board"
              onDragStart={(e)=>{
                e.dataTransfer.setData('text/plain',String(n));
                e.dataTransfer.effectAllowed='copy';
              }}
              onDragEnd={()=>setDropTarget(null)}
              onClick={()=>handleNum(n)}
              style={{
              width:44,height:52,borderRadius:4,border:`1px solid ${palette.border}`,
              background:palette.card,color:palette.text,
              fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,
              transition:'background 0.15s',
            }}>{n}</button>
          ))}
        </div>
        {/* Note mode toggle */}
        <button onClick={()=>setNoteMode(m=>!m)} style={{
          padding:'8px 20px',borderRadius:4,
          border:`2px solid ${noteMode?palette.accent:palette.border}`,
          background:noteMode?palette.accentSoft:'transparent',
          color:noteMode?palette.accent:palette.sub,
          cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14,fontWeight:600,letterSpacing:1,
        }}>✏ Notes {noteMode?'ON':'OFF'}</button>
      </div>
      </div>

      {/* Leaderboard - right side (daily puzzle only) */}
      {user && isDailyGame && (
        <div style={{minWidth:280,width:320,flexShrink:0}}>
          <div style={{fontSize:11,letterSpacing:2,color:palette.sub,marginBottom:10,textTransform:'uppercase'}}>Today&apos;s Leaderboard</div>
          <div style={{background:palette.card,borderRadius:6,border:`1px solid ${palette.border}`,overflow:'hidden',maxHeight:400,overflowY:'auto'}}>
            {leaderboard === null || (leaderboard && leaderboard.length === 0) ? (
              <div style={{padding:16,color:palette.sub,fontSize:13,textAlign:'center'}}>{leaderboard === null ? 'Loading...' : 'No completions yet'}</div>
            ) : leaderboard.map((entry,i)=>(
              <div key={i} style={{
                display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',
                borderBottom:i<leaderboard.length-1?`1px solid ${palette.border}`:'none',
                fontFamily:"'Crimson Pro',serif",fontSize:13,
              }}>
                <span style={{display:'flex',alignItems:'center',gap:6,minWidth:0,flex:1}}>
                  <span style={{color:palette.accent,fontWeight:700,minWidth:20}}>#{i+1}</span>
                  <span style={{color:palette.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}}>{entry.nickname}</span>
                  <span style={{color:palette.sub,fontSize:11,textTransform:'capitalize',minWidth:56}}>{entry.difficulty}</span>
                  <span style={{color:'#ff6b6b',fontSize:12,minWidth:48}}>{entry.lives != null ? '♥'.repeat(Math.max(0,entry.lives)) : ''}</span>
                </span>
                <span style={{color:palette.accent,fontWeight:600,fontSize:14,flexShrink:0,marginLeft:8}}>{`${String(Math.floor(entry.time/60)).padStart(2,'0')}:${String(entry.time%60).padStart(2,'0')}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
