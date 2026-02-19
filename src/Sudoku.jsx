import { useState, useEffect, useCallback, useRef } from "react";

// ── Sudoku generation ──────────────────────────────────────────────────────────
function emptyGrid() { return Array.from({length:9},()=>Array(9).fill(0)); }

function isValid(g,r,c,n){
  for(let i=0;i<9;i++){if(g[r][i]===n||g[i][c]===n)return false;}
  const br=Math.floor(r/3)*3,bc=Math.floor(c/3)*3;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(g[br+i][bc+j]===n)return false;
  return true;
}

function solve(g){
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
    if(g[r][c]===0){
      const nums=[1,2,3,4,5,6,7,8,9].sort(()=>Math.random()-0.5);
      for(const n of nums){
        if(isValid(g,r,c,n)){g[r][c]=n;if(solve(g))return true;g[r][c]=0;}
      }
      return false;
    }
  }
  return true;
}

function generatePuzzle(difficulty){
  const solution=emptyGrid();
  solve(solution);
  const clues={easy:45,medium:35,hard:25}[difficulty]||35;
  const puzzle=solution.map(r=>[...r]);
  let removed=81-clues;
  while(removed>0){
    const r=Math.floor(Math.random()*9),c=Math.floor(Math.random()*9);
    if(puzzle[r][c]!==0){puzzle[r][c]=0;removed--;}
  }
  return {puzzle,solution};
}
// ──────────────────────────────────────────────────────────────────────────────

const HEARTS = ["♥","♥","♥","♥","♥"];

export default function Sudoku(){
  const [screen,setScreen]=useState("menu"); // menu | game | over | win
  const [difficulty,setDifficulty]=useState("medium");
  const [puzzle,setPuzzle]=useState(null);
  const [solution,setSolution]=useState(null);
  const [board,setBoard]=useState(null);   // user values
  const [notes,setNotes]=useState(null);   // 9x9 array of Set<number>
  const [given,setGiven]=useState(null);   // fixed cells
  const [selected,setSelected]=useState(null);
  const [noteMode,setNoteMode]=useState(false);
  const [lives,setLives]=useState(5);
  const [time,setTime]=useState(0);
  const [errors,setErrors]=useState(null); // Set of "r,c"
  const timerRef=useRef(null);

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
    setNoteMode(false);
    setScreen("game");
    startTimer();
  }

  function handleCellClick(r,c){setSelected([r,c]);}

  function handleNum(n){
    if(!selected||!board)return;
    const [r,c]=selected;
    if(given[r][c])return;
    if(noteMode){
      setNotes(prev=>{
        const next=prev.map(row=>row.map(s=>new Set(s)));
        if(next[r][c].has(n))next[r][c].delete(n);
        else next[r][c].add(n);
        return next;
      });
      return;
    }
    // place guess
    const correct=solution[r][c]===n;
    const newBoard=board.map(row=>[...row]);
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
      const newErrors=new Set(errors);
      newErrors.add(`${r},${c}`);
      setErrors(newErrors);
      const newLives=lives-1;
      setLives(newLives);
      if(newLives<=0){stopTimer();setScreen("over");return;}
    } else {
      setErrors(prev=>{const s=new Set(prev);s.delete(`${r},${c}`);return s;});
      // check win
      const allFilled=newBoard.every((row,ri)=>row.every((v,ci)=>v===solution[ri][ci]));
      if(allFilled){stopTimer();setScreen("win");}
    }
  }

  function handleErase(){
    if(!selected||!board)return;
    const [r,c]=selected;
    if(given[r][c])return;
    const newBoard=board.map(row=>[...row]);
    newBoard[r][c]=0;
    setBoard(newBoard);
    setNotes(prev=>{
      const next=prev.map(row=>row.map(s=>new Set(s)));
      next[r][c]=new Set();
      return next;
    });
    setErrors(prev=>{const s=new Set(prev);s.delete(`${r},${c}`);return s;});
  }

  useEffect(()=>{
    function onKey(e){
      if(screen!=="game")return;
      if(e.key>='1'&&e.key<='9')handleNum(parseInt(e.key));
      if(e.key==='Backspace'||e.key==='Delete')handleErase();
      if(e.key==='n'||e.key==='N')setNoteMode(m=>!m);
      if(!selected)return;
      const [r,c]=selected;
      if(e.key==='ArrowUp'&&r>0)setSelected([r-1,c]);
      if(e.key==='ArrowDown'&&r<8)setSelected([r+1,c]);
      if(e.key==='ArrowLeft'&&c>0)setSelected([r,c-1]);
      if(e.key==='ArrowRight'&&c<8)setSelected([r,c+1]);
    }
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  });

  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

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
    const sel=selected&&selected[0]===r&&selected[1]===c;
    const related=selected&&(selected[0]===r||selected[1]===c||
      (Math.floor(selected[0]/3)===Math.floor(r/3)&&Math.floor(selected[1]/3)===Math.floor(c/3)));
    const isErr=errors&&errors.has(`${r},${c}`);
    const sameVal=selected&&board&&board[selected[0]][selected[1]]!==0&&
      board[r][c]===board[selected[0]][selected[1]]&&!sel;
    return{
      width:52,height:52,display:'flex',alignItems:'center',justifyContent:'center',
      position:'relative',cursor:'pointer',userSelect:'none',
      background:sel?palette.selected:sameVal?'rgba(232,197,71,0.12)':related?palette.relatedBg:'transparent',
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
    <div style={{minHeight:'100vh',background:palette.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Crimson Pro',Georgia,serif",color:palette.text}}>
      <div style={{textAlign:'center',maxWidth:420,padding:'0 24px'}}>
        <div style={{fontSize:72,letterSpacing:-2,fontFamily:"'Playfair Display',serif",fontWeight:900,lineHeight:1,color:palette.accent}}>数独</div>
        <div style={{fontSize:36,fontFamily:"'Playfair Display',serif",fontWeight:700,marginBottom:8}}>SUDOKU</div>
        <div style={{color:palette.sub,marginBottom:48,fontSize:16}}>A classic puzzle. Five lives. One timer.</div>

        <div style={{marginBottom:32}}>
          <div style={{fontSize:13,letterSpacing:3,color:palette.sub,marginBottom:16,textTransform:'uppercase'}}>Difficulty</div>
          <div style={{display:'flex',gap:12,justifyContent:'center'}}>
            {['easy','medium','hard'].map(d=>(
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

        <button onClick={startGame} style={{
          padding:'16px 64px',borderRadius:4,border:`2px solid ${palette.accent}`,
          background:palette.accent,color:palette.bg,cursor:'pointer',
          fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,letterSpacing:2,
          transition:'all 0.2s',
        }}>BEGIN</button>

        <div style={{marginTop:48,color:palette.sub,fontSize:14,lineHeight:1.8}}>
          <div>Click a cell → tap a number to fill</div>
          <div>Press <kbd style={{background:palette.card,padding:'1px 6px',borderRadius:3,color:palette.text}}>N</kbd> to toggle note mode</div>
          <div>Arrow keys to navigate</div>
        </div>
      </div>
    </div>
  );

  if(screen==="over"||screen==="win") return (
    <div style={{minHeight:'100vh',background:palette.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Crimson Pro',Georgia,serif",color:palette.text}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:80,marginBottom:16}}>{screen==="win"?"✨":"💀"}</div>
        <div style={{fontSize:48,fontFamily:"'Playfair Display',serif",fontWeight:900,color:screen==="win"?palette.accent:palette.error}}>
          {screen==="win"?"SOLVED!":"GAME OVER"}
        </div>
        <div style={{color:palette.sub,fontSize:18,marginTop:8}}>Time: {fmt(time)}</div>
        <div style={{display:'flex',gap:12,marginTop:40,justifyContent:'center'}}>
          <button onClick={startGame} style={{padding:'14px 40px',borderRadius:4,border:`2px solid ${palette.accent}`,background:palette.accent,color:palette.bg,cursor:'pointer',fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700}}>Play Again</button>
          <button onClick={()=>{stopTimer();setScreen("menu");}} style={{padding:'14px 40px',borderRadius:4,border:`2px solid ${palette.border}`,background:'transparent',color:palette.sub,cursor:'pointer',fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700}}>Menu</button>
        </div>
      </div>
    </div>
  );

  // ── Game screen ──
  return (
    <div style={{minHeight:'100vh',background:palette.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Crimson Pro',Georgia,serif",color:palette.text,padding:'20px 0'}}>
      <style>{`
        .num-btn:hover{background:rgba(232,197,71,0.2)!important;}
      `}</style>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:468,marginBottom:20}}>
        <div style={{display:'flex',gap:4}}>
          {HEARTS.map((_,i)=>(
            <span key={i} style={{fontSize:22,color:i<lives?'#ff6b6b':'rgba(255,107,107,0.2)',transition:'color 0.3s'}}>♥</span>
          ))}
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:11,letterSpacing:3,color:palette.sub,textTransform:'uppercase'}}>{difficulty}</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:22,color:palette.accent}}>{fmt(time)}</div>
        </div>
        <button onClick={()=>{stopTimer();setScreen("menu");}} style={{background:'transparent',border:`1px solid ${palette.border}`,color:palette.sub,padding:'6px 14px',borderRadius:4,cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14}}>Menu</button>
      </div>

      {/* Board */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(9,52px)',borderRadius:6,overflow:'hidden',boxShadow:'0 8px 48px rgba(0,0,0,0.6)'}}>
        {board&&board.map((row,r)=>row.map((val,c)=>{
          const noteSet=notes[r][c];
          return(
            <div key={`${r},${c}`} style={cellStyle(r,c)} onClick={()=>handleCellClick(r,c)}>
              {val!==0?(
                <span>{val}</span>
              ):(
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',width:'100%',height:'100%',padding:2,boxSizing:'border-box'}}>
                  {[1,2,3,4,5,6,7,8,9].map(n=>(
                    <span key={n} style={{fontSize:9,color:palette.notecol,textAlign:'center',lineHeight:'14px',fontWeight:600}}>
                      {noteSet.has(n)?n:''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }))}
      </div>

      {/* Controls */}
      <div style={{marginTop:20,display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        {/* Note mode toggle + Erase */}
        <div style={{display:'flex',gap:12}}>
          <button onClick={()=>setNoteMode(m=>!m)} style={{
            padding:'8px 20px',borderRadius:4,
            border:`2px solid ${noteMode?palette.accent:palette.border}`,
            background:noteMode?palette.accentSoft:'transparent',
            color:noteMode?palette.accent:palette.sub,
            cursor:'pointer',fontFamily:"'Crimson Pro',serif",fontSize:14,fontWeight:600,letterSpacing:1,
          }}>✏ Notes {noteMode?'ON':'OFF'}</button>
          <button onClick={handleErase} style={{
            padding:'8px 20px',borderRadius:4,border:`2px solid ${palette.border}`,
            background:'transparent',color:palette.sub,cursor:'pointer',
            fontFamily:"'Crimson Pro',serif",fontSize:14,fontWeight:600,letterSpacing:1,
          }}>⌫ Erase</button>
        </div>
        {/* Number pad */}
        <div style={{display:'flex',gap:8}}>
          {[1,2,3,4,5,6,7,8,9].map(n=>(
            <button key={n} className="num-btn" onClick={()=>handleNum(n)} style={{
              width:44,height:52,borderRadius:4,border:`1px solid ${palette.border}`,
              background:palette.card,color:palette.text,cursor:'pointer',
              fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,
              transition:'background 0.15s',
            }}>{n}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
