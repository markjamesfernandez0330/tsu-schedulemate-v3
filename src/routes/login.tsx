import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

// ─── THEMES ──────────────────────────────────────────────────────────────────
const THEMES = [
  "sea","forest","space","sky","desert","racing","arctic","volcano","fantasy","gamer",
] as const;

const THEME_NAMES = [
  "Deep Sea","Mountain Hiking","Deep Space","Sky Diving","Desert Safari",
  "Go-Kart Racing","Arctic Tundra","Volcanic Core","Sky Islands","Gamer's Room",
];

const THEME_GRADIENTS: Record<typeof THEMES[number], string> = {
  sea:     "linear-gradient(135deg,#010b14,#0a243a,#001f3f)",
  forest:  "linear-gradient(135deg,#0f1a0c,#223f1b,#3b5336)",
  space:   "linear-gradient(135deg,#020208,#0d0b18,#110924)",
  sky:     "linear-gradient(135deg,#4a90e2,#2c3e50,#1a252f)",
  desert:  "linear-gradient(135deg,#2c1402,#5c350b,#8c5213)",
  racing:  "linear-gradient(135deg,#0a0a0f,#161424,#2d1212)",
  arctic:  "linear-gradient(135deg,#0b1d28,#1c3d52,#2e5b70)",
  volcano: "linear-gradient(135deg,#140300,#2d0a00,#4a1200)",
  fantasy: "linear-gradient(135deg,#0a0c1f,#1a103c,#311854)",
  gamer:   "linear-gradient(135deg,#0a0a0d,#111116,#050508)",
};

// ─── PAC-MAN MAP ─────────────────────────────────────────────────────────────
const PAC_MAP_TEMPLATE: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,3,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,3,1],
  [1,0,1,1,0,1,1,1,0,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,1,1,0,0,0,1,0,0,0,0,1],
  [1,1,1,1,0,1,1,1,2,1,1,2,1,1,1,0,1,1,1,1],
  [2,2,2,1,0,1,2,2,2,2,2,2,2,2,1,0,1,2,2,2],
  [1,1,1,1,0,1,2,1,1,2,2,1,1,2,1,0,1,1,1,1],
  [2,2,2,2,0,2,2,1,2,2,2,2,1,2,2,0,2,2,2,2],
  [1,1,1,1,0,1,2,1,1,1,1,1,1,2,1,0,1,1,1,1],
  [1,0,0,0,0,1,2,2,2,2,2,2,2,2,1,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,1,1,1,1,1,1,1,0,1,1,0,1],
  [1,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CELL = 40;
const VW   = 800;
const VH   = 600;
const ROWS = PAC_MAP_TEMPLATE.length;
const COLS = PAC_MAP_TEMPLATE[0].length;
const FRIGHTENED_FRAMES = 300;
const RESPAWN_FRAMES    = 180;
const HALF = CELL / 2;

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Particle {
  x:number; y:number; size:number; vx:number; vy:number; alpha:number;
  color?:string; rot?:number; rotSpeed?:number; twinkle?:number;
  reset():void; update(w:number,h:number):void; draw(ctx:CanvasRenderingContext2D):void;
}
interface ActorConfig { role:string; x:number; y:number; speed:number; size:number; extra?:any; }
interface GhostState {
  col:number; row:number; vx:number; vy:number; color:string;
  frightened:boolean; respawnTimer:number;
}
interface PacState {
  col:number; row:number; vx:number; vy:number;
  nextVx:number; nextVy:number; moveTimer:number;
}
interface EngineState {
  activeGame:'flappy'|'pacman';
  tvExpandFactor:number;
  state:'idle'|'expanding'|'playing'|'gameover'|'shrinking'|'levelcomplete'|'congrats';
  flappy:{
    birdY:number; birdVelocity:number; gravity:number; jumpStrength:number;
    pipes:Array<{x:number;topHeight:number;passed:boolean}>;
    score:number; highScore:number; pipeSpeed:number; pipeSpawnTimer:number;
  };
  pac:PacState;
  pacScore:number; pacHighScore:number; pacLevel:number;
  pacDots:number[][];
  ghosts:GhostState[];
  frightenedTimer:number; levelTimer:number; congratsTimer:number;
  ghostMoveTimer:number[];
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function isWallTile(dots:number[][], row:number, col:number): boolean {
  if (row<0||row>=ROWS||col<0||col>=COLS) return true;
  return dots[row][col]===1;
}
function tileToPixel(tile:number): number { return tile*CELL+HALF; }

function initEngine(): EngineState {
  return {
    activeGame:'flappy', tvExpandFactor:0, state:'idle',
    flappy:{
      birdY:250, birdVelocity:0, gravity:0.5, jumpStrength:-9, pipes:[],
      score:0,
      highScore: typeof window!=='undefined' ? parseInt(localStorage.getItem('flappyHighScore')||'0') : 0,
      pipeSpeed:5, pipeSpawnTimer:0,
    },
    pac:{col:10,row:11,vx:-1,vy:0,nextVx:-1,nextVy:0,moveTimer:0},
    pacScore:0,
    pacHighScore: typeof window!=='undefined' ? parseInt(localStorage.getItem('pacmanHighScore')||'0') : 0,
    pacLevel:1, pacDots:[], ghosts:[],
    frightenedTimer:0, levelTimer:0, congratsTimer:0,
    ghostMoveTimer:[0,0,0,0],
  };
}

function resetPacLevel(e:EngineState, level:number) {
  e.pacLevel        = level;
  e.pacDots         = JSON.parse(JSON.stringify(PAC_MAP_TEMPLATE));
  e.frightenedTimer = 0; e.levelTimer = 0; e.congratsTimer = 0;
  e.ghostMoveTimer  = [0,0,0,0];
  e.pac = {col:10,row:11,vx:-1,vy:0,nextVx:-1,nextVy:0,moveTimer:0};
  e.ghosts = [
    {col:9, row:7, vx: 1, vy:0, color:'#ff0000', frightened:false, respawnTimer:0},
    {col:10,row:7, vx:-1, vy:0, color:'#ffb8ff', frightened:false, respawnTimer:0},
    {col:9, row:8, vx: 1, vy:0, color:'#00ffff', frightened:false, respawnTimer:0},
    {col:10,row:8, vx:-1, vy:0, color:'#ffb852', frightened:false, respawnTimer:0},
  ];
}

// ─── ROUTE ────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — TSU Scheduling" }] }),
  component: LoginPage,
});

// ─── COMPONENT ────────────────────────────────────────────────────────────────
function LoginPage() {
  const { user, role, loading, signIn } = useAuth();
  const router = useRouter();
  const [busy,              setBusy]              = useState(false);
  const [themeIndex,        setThemeIndex]         = useState(() => Math.floor(Math.random() * (THEMES.length - 1)));
  const [isGameActive,      setIsGameActive]       = useState(false);
  const [activeSubGame,     setActiveSubGame]      = useState<'flappy'|'pacman'>('flappy');

  const canvasRef     = useRef<HTMLCanvasElement|null>(null);
  const themeIndexRef = useRef(themeIndex);
  const engineRef     = useRef<EngineState>(initEngine());

  useEffect(() => { themeIndexRef.current = themeIndex; }, [themeIndex]);

  // Redirect when already signed in
  useEffect(() => {
    if (!loading && user) {
      router.navigate({ to: role === "admin" ? "/admin" : "/book" });
    }
  }, [user, role, loading, router]);

  // ── theme ─────────────────────────────────────────────────────────────────
  const shiftTheme = (dir: 1 | -1) => {
    if (isGameActive) { setIsGameActive(false); engineRef.current.state = 'shrinking'; }
    setThemeIndex(p => (p + dir + THEMES.length) % THEMES.length);
  };

  // ── sub-game switch ───────────────────────────────────────────────────────
  const switchSubGame = (game: 'flappy' | 'pacman') => {
    const e = engineRef.current;
    e.activeGame = game;
    setActiveSubGame(game);
    e.state = 'idle';
    setIsGameActive(false);
    if (game === 'pacman') resetPacLevel(e, 1);
  };

  // ── game input ────────────────────────────────────────────────────────────
  const handleGameInput = () => {
    if (THEMES[themeIndexRef.current] !== 'gamer') return;
    const e = engineRef.current;
    if (e.state === 'idle' || e.state === 'shrinking') {
      e.state = 'expanding';
      setIsGameActive(true);
      if (e.activeGame === 'flappy') {
        e.flappy.score = 0; e.flappy.pipes = []; e.flappy.birdY = 250; e.flappy.birdVelocity = 0;
      } else {
        const hi = e.pacHighScore; resetPacLevel(e, 1); e.pacHighScore = hi; e.pacScore = 0;
      }
    } else if (e.state === 'playing') {
      if (e.activeGame === 'flappy') e.flappy.birdVelocity = e.flappy.jumpStrength;
    } else if (e.state === 'gameover') {
      if (e.activeGame === 'flappy') {
        e.flappy.score = 0; e.flappy.pipes = []; e.flappy.birdY = 250;
        e.flappy.birdVelocity = e.flappy.jumpStrength;
      } else {
        const hi = e.pacHighScore; resetPacLevel(e, 1); e.pacHighScore = hi; e.pacScore = 0;
      }
      e.state = 'playing';
    } else if (e.state === 'congrats') {
      const hi = e.pacHighScore; resetPacLevel(e, 1); e.pacHighScore = hi; e.pacScore = 0;
      e.state = 'playing';
    }
  };

  // ── keyboard + touch ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const e = engineRef.current;

      if (isGameActive && e.activeGame === 'pacman' && e.state === 'playing') {
        switch (ev.key) {
          case 'ArrowUp':    e.pac.nextVx=0;  e.pac.nextVy=-1; ev.preventDefault(); return;
          case 'ArrowDown':  e.pac.nextVx=0;  e.pac.nextVy=1;  ev.preventDefault(); return;
          case 'ArrowLeft':  e.pac.nextVx=-1; e.pac.nextVy=0;  ev.preventDefault(); return;
          case 'ArrowRight': e.pac.nextVx=1;  e.pac.nextVy=0;  ev.preventDefault(); return;
        }
      }

      const pacBusy = e.activeGame === 'pacman' &&
        (e.state==='playing'||e.state==='gameover'||e.state==='levelcomplete'||e.state==='congrats'||e.state==='expanding');
      if (!pacBusy) {
        if (ev.key === 'ArrowRight') { ev.preventDefault(); shiftTheme(1); }
        if (ev.key === 'ArrowLeft')  { ev.preventDefault(); shiftTheme(-1); }
      }

      if (ev.key === 'Escape' && isGameActive) { setIsGameActive(false); engineRef.current.state = 'shrinking'; }
      if ((ev.key === ' ' || ev.key === 'Spacebar') && THEMES[themeIndexRef.current] === 'gamer') {
        ev.preventDefault(); handleGameInput();
      }

      if (ev.key === 'q' || ev.key === 'Q') {
        if (e.activeGame === 'pacman' && e.state === 'playing') {
          e.frightenedTimer = FRIGHTENED_FRAMES;
          e.ghosts.forEach(g => { if (g.respawnTimer <= 0) { g.frightened = true; g.vx = -g.vx; g.vy = -g.vy; } });
        }
      }
    };

    let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
    let tapCount = 0;
    let tapTimer: ReturnType<typeof setTimeout> | null = null;

    const onTouchStart = (ev: TouchEvent) => {
      touchStartX = ev.touches[0].clientX;
      touchStartY = ev.touches[0].clientY;
      touchStartTime = Date.now();
    };

    const onTouchEnd = (ev: TouchEvent) => {
      const dx    = ev.changedTouches[0].clientX - touchStartX;
      const dy    = ev.changedTouches[0].clientY - touchStartY;
      const dt    = Date.now() - touchStartTime;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const e     = engineRef.current;

      if ((absDx > 30 || absDy > 30) && dt < 500) {
        if (e.activeGame === 'pacman' && e.state === 'playing') {
          if (absDx > absDy) {
            if (dx > 0) { e.pac.nextVx=1;  e.pac.nextVy=0; }
            else        { e.pac.nextVx=-1; e.pac.nextVy=0; }
          } else {
            if (dy > 0) { e.pac.nextVx=0; e.pac.nextVy=1;  }
            else        { e.pac.nextVx=0; e.pac.nextVy=-1; }
          }
        }
        return;
      }

      if (absDx < 10 && absDy < 10 && dt < 300) {
        tapCount++;
        if (tapTimer) clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { tapCount = 0; }, 600);
        if (tapCount >= 3) {
          tapCount = 0;
          if (e.activeGame === 'pacman' && e.state === 'playing') {
            e.frightenedTimer = FRIGHTENED_FRAMES;
            e.ghosts.forEach(g => { if (g.respawnTimer <= 0) { g.frightened = true; g.vx = -g.vx; g.vy = -g.vy; } });
          }
        }
      }
    };

    window.addEventListener('keydown',    onKey);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      window.removeEventListener('keydown',    onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend',   onTouchEnd);
    };
  }, [isGameActive]);

  // ── CANVAS LOOP ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    let W = (canvas.width  = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    let particles: Particle[] = [];
    let actors: ActorConfig[]  = [];

    const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; buildEnv(); };
    window.addEventListener('resize', onResize);

    // ── particle factory ────────────────────────────────────────────────────
    function mkParticle(type: string): Particle {
      const p: any = {
        reset() {
          this.x = Math.random() * W;
          if (type==='sea'){this.y=H+Math.random()*50;this.size=Math.random()*3+1;this.vy=-(Math.random()*1.2+0.4);this.vx=Math.random()*0.4-0.2;this.alpha=Math.random()*0.4+0.1;}
          else if(type==='forest'){this.y=-20-Math.random()*50;this.size=Math.random()*6+4;this.vy=Math.random()*1+0.6;this.vx=Math.random()*1.5-0.5;this.alpha=Math.random()*0.6+0.3;this.color=['#d4a373','#e76f51','#f4a261','#e9c46a','#a3b18a'][Math.floor(Math.random()*5)];this.rot=Math.random()*Math.PI;this.rotSpeed=Math.random()*0.02-0.01;}
          else if(type==='space'||type==='fantasy'){this.y=Math.random()*H;this.size=Math.random()*1.5+0.3;this.alpha=Math.random()*0.8+0.2;this.twinkle=Math.random()*0.02+0.005;}
          else if(type==='sky'){this.y=Math.random()*H;this.size=Math.random()*40+20;this.vx=Math.random()*0.5+0.2;this.vy=-(Math.random()*5+5);this.alpha=Math.random()*0.08+0.03;}
          else if(type==='desert'){this.x=W+Math.random()*50;this.y=Math.random()*H;this.size=Math.random()*2+0.5;this.vx=-(Math.random()*4+3);this.vy=Math.random()*0.6-0.3;this.alpha=Math.random()*0.5+0.1;}
          else if(type==='racing'){this.y=(H-180)+Math.random()*120;this.size=Math.random()*3+2;this.vx=-(Math.random()*6+5);this.vy=-Math.random()*0.4;this.alpha=Math.random()*0.3+0.1;}
          else if(type==='arctic'){this.y=-10-Math.random()*20;this.size=Math.random()*3+1;this.vy=Math.random()*1.5+1;this.vx=Math.random()*1-0.5;this.alpha=Math.random()*0.7+0.3;}
          else if(type==='volcano'){this.y=H+10+Math.random()*30;this.size=Math.random()*4+1;this.vy=-(Math.random()*2+1);this.vx=Math.random()*1-0.5;this.alpha=Math.random()*0.8+0.2;this.color=['#ff3700','#ff7700','#ffaa00','#441100'][Math.floor(Math.random()*4)];}
          else if(type==='gamer'){this.y=Math.random()*H;this.size=Math.random()*1.5+0.5;this.vy=-(Math.random()*0.5+0.2);this.vx=(Math.random()-0.5)*0.5;this.alpha=Math.random()*0.3+0.1;}
        },
        update(w:number,h:number){
          if(type==='sea'){this.y+=this.vy;this.x+=this.vx;if(this.y<-10)this.reset();}
          else if(type==='forest'||type==='arctic'){this.y+=this.vy;this.x+=this.vx;if(type==='forest')this.rot+=this.rotSpeed;if(this.y>h+20)this.reset();}
          else if(type==='space'||type==='fantasy'){this.alpha+=this.twinkle;if(this.alpha>1||this.alpha<0.2)this.twinkle=-this.twinkle;}
          else if(type==='sky'){this.y+=this.vy;if(this.y<-100){this.y=h+100;this.x=Math.random()*w;}}
          else if(type==='desert'||type==='racing'){this.x+=this.vx;this.y+=this.vy;if(type==='racing')this.size+=0.05;if(this.x<-20)this.reset();}
          else if(type==='volcano'){this.y+=this.vy;this.x+=this.vx;this.alpha-=0.002;if(this.y<-10||this.alpha<=0)this.reset();}
          else if(type==='gamer'){this.y+=this.vy;this.x+=this.vx;if(this.y<-10){this.y=h+10;this.x=Math.random()*w;}}
        },
        draw(c:CanvasRenderingContext2D){
          c.save();c.globalAlpha=this.alpha;
          if(type==='sea'||type==='space'||type==='arctic'||type==='fantasy'){c.fillStyle='#fff';c.beginPath();c.arc(this.x,this.y,this.size,0,Math.PI*2);c.fill();}
          else if(type==='forest'){c.fillStyle=this.color;c.translate(this.x,this.y);c.rotate(this.rot);c.beginPath();c.ellipse(0,0,this.size,this.size*0.5,0,0,Math.PI*2);c.fill();}
          else if(type==='sky'){c.fillStyle='rgba(255,255,255,0.7)';c.beginPath();c.arc(this.x,this.y,this.size,0,Math.PI*2);c.fill();}
          else if(type==='desert'){c.fillStyle='#e9c46a';c.beginPath();c.arc(this.x,this.y,this.size,0,Math.PI*2);c.fill();}
          else if(type==='racing'){c.fillStyle='#999';c.beginPath();c.arc(this.x,this.y,this.size,0,Math.PI*2);c.fill();}
          else if(type==='volcano'){c.fillStyle=this.color;c.shadowBlur=10;c.shadowColor=this.color;c.beginPath();c.arc(this.x,this.y,this.size,0,Math.PI*2);c.fill();}
          else if(type==='gamer'){c.fillStyle='rgba(255,255,255,0.4)';c.beginPath();c.arc(this.x,this.y,this.size,0,Math.PI*2);c.fill();}
          c.restore();
        },
      };
      p.reset(); return p as Particle;
    }

    // ── build environment ───────────────────────────────────────────────────
    function buildEnv() {
      particles = []; actors = [];
      const t   = THEMES[themeIndexRef.current];
      const now = Date.now();
      const pc  = t==='space'?250:t==='volcano'?180:t==='gamer'?40:100;
      for (let i = 0; i < pc; i++) particles.push(mkParticle(t));

      if (t==='sea'){
        actors.push({role:'whale',x:100,y:H*0.35,speed:0.4,size:100});
        const spots:any[]=[];for(let s=0;s<15;s++)spots.push({x:-40+Math.random()*80,y:-15+Math.random()*30,r:1.5+Math.random()*2});
        actors.push({role:'whale-shark',x:-200,y:H*0.6,speed:0.6,size:90,extra:{spots}});
        actors.push({role:'submarine',x:W+200,y:H*0.8,speed:-0.7,size:65});
        const tgts:any[]=[];
        for(let i=0;i<12;i++){const f={role:'hunted-fish',x:W*0.4+i*15,y:H*0.5+Math.sin(i)*20,speed:1.6,size:7};tgts.push(f);actors.push(f);}
        actors.push({role:'shark',x:-100,y:H*0.5,speed:2.2,size:55,extra:{targets:tgts}});
        for(let i=0;i<Math.floor(Math.random()*3)+4;i++) actors.push({role:'scuba-diver',x:Math.random()*W,y:H*0.3+Math.random()*(H*0.5),speed:0.3+Math.random()*0.5,size:20});
      } else if(t==='forest'){
        actors.push({role:'airplane',x:-50,y:H*0.1,speed:1.5,size:40});
        for(let i=0;i<5;i++) actors.push({role:'forest-bird',x:W*0.2+i*35,y:H*0.22+Math.sin(i)*15,speed:1.3,size:8});
        for(let i=0;i<Math.floor(Math.random()*3)+3;i++) actors.push({role:'hiker',x:W*0.3+i*50,y:H-110,speed:0.65,size:20});
        for(let i=0;i<3;i++) actors.push({role:'monkey',x:W*0.1+(i+1)*(W*0.18),y:H-280,speed:0,size:12,extra:{phase:i*40}});
      } else if(t==='space'){
        for(let i=0;i<Math.floor(Math.random()*3)+3;i++) actors.push({role:'astronaut',x:W*0.2+i*170,y:H*0.4+Math.sin(i)*60,speed:0.25*(i%2===0?1:-1),size:25,extra:{vy:0.12*(i%2===0?-1:1),rot:Math.random(),rotSpeed:0.003*(i%2===0?1:-1)}});
      } else if(t==='sky'){
        actors.push({role:'jump-plane',x:-100,y:H*0.15,speed:2.2,size:80});
        for(let i=0;i<3;i++) actors.push({role:'sky-bird',x:W*0.7+i*40,y:H*0.5+i*20,speed:0.8,size:10,extra:{vy:-1.5}});
        for(let i=0;i<Math.floor(Math.random()*3)+3;i++) actors.push({role:'skydiver',x:0,y:0,speed:4.2,size:18,extra:{jumped:false,diverIdx:i,spawnTime:now,isEarlyDeployer:i===0,deployed:false}});
      } else if(t==='desert'){
        actors.push({role:'safari-jeep',x:100,y:H-150,speed:2.0,size:30});
        for(let i=0;i<3;i++) actors.push({role:'camel',x:W*0.45+i*60,y:H-130,speed:0.5,size:25});
      } else if(t==='racing'){
        const cols=['#f43f5e','#0ea5e9','#eab308','#22c55e','#a855f7'];
        for(let i=0;i<Math.floor(Math.random()*3)+3;i++){const lY=(H-165)+(i*24);actors.push({role:'go-kart',x:Math.random()*(W*0.5),y:lY,speed:4.5+Math.random()*1.5,size:22,extra:{kartIdx:i,baseY:lY,color:cols[i%cols.length]}});}
      } else if(t==='arctic'){
        actors.push({role:'whale',x:W*0.2,y:H-180,speed:0.25,size:85});
        for(let i=0;i<Math.floor(Math.random()*3)+3;i++) actors.push({role:'penguin',x:W*0.5+i*45,y:H-85,speed:0.4,size:14});
        actors.push({role:'igloo',x:W*0.75,y:H-100,speed:0,size:45});
        for(let i=0;i<3;i++) actors.push({role:'arctic-walker',x:W*0.65-i*40,y:H-90,speed:0.3,size:16,extra:{offset:i}});
      } else if(t==='volcano'){
        actors.push({role:'dragon',x:-200,y:H*0.3,speed:1.8,size:60});
        for(let i=0;i<Math.floor(Math.random()*2)+3;i++) actors.push({role:'magma-pod',x:W*0.25+(i*160),y:H-60,speed:0,size:30+Math.random()*15});
      } else if(t==='fantasy'){
        actors.push({role:'dragon',x:W+200,y:H*0.25,speed:-1.2,size:70});
        for(let i=0;i<4;i++){const jh=i===3;const ix=W*0.15+(i*(W*0.22));const iy=H*0.5+(Math.sin(i)*50);actors.push({role:'floating-house',x:ix,y:iy,speed:0,size:65,extra:{isJumpingHouse:jh,offset:i}});if(jh)actors.push({role:'fantasy-jumper',x:ix,y:iy-30,speed:1.5,size:15,extra:{startY:iy-30}});}
      }
    }

    // ── scenery ─────────────────────────────────────────────────────────────
    function drawScenery(t:string){
      if(t==='forest'){
        ctx.fillStyle='#1e3318';ctx.beginPath();ctx.moveTo(0,H);ctx.lineTo(W*0.3,H-320);ctx.lineTo(W*0.7,H);ctx.closePath();ctx.fill();
        ctx.fillStyle='#172713';ctx.beginPath();ctx.moveTo(W*0.4,H);ctx.lineTo(W*0.8,H-260);ctx.lineTo(W,H);ctx.closePath();ctx.fill();
        ctx.fillStyle='#2d4a22';ctx.fillRect(0,H-100,W,100);
        for(let i=1;i<=4;i++){const tx=W*0.1+i*(W*0.18);ctx.fillStyle='#432818';ctx.fillRect(tx-10,H-320,20,220);ctx.fillStyle='#556b2f';ctx.beginPath();ctx.arc(tx,H-320,55,0,Math.PI*2);ctx.fill();}
      } else if(t==='space'){
        ctx.fillStyle='#161622';ctx.beginPath();ctx.arc(W/2,H+1200,1300,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#0f0f18';ctx.beginPath();ctx.arc(W*0.2,H-40,45,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(W*0.75,H-70,70,0,Math.PI*2);ctx.fill();
      } else if(t==='desert'){
        ctx.fillStyle='#f4a261';ctx.beginPath();ctx.arc(W*0.75,H*0.3,110,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#c97d32';ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=20)ctx.lineTo(x,(H-120)+Math.sin(x*0.006)*45);ctx.lineTo(W,H);ctx.closePath();ctx.fill();
        ctx.fillStyle='#a6601b';ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=20)ctx.lineTo(x,(H-80)+Math.cos(x*0.005)*35);ctx.lineTo(W,H);ctx.closePath();ctx.fill();
      } else if(t==='racing'){
        ctx.fillStyle='#24242b';ctx.fillRect(0,H-190,W,140);
        ctx.fillStyle='#e63946';ctx.fillRect(0,H-195,W,5);ctx.fillRect(0,H-50,W,5);
        ctx.fillStyle='#f1faee';for(let x=0;x<W;x+=50){ctx.fillRect(x,H-195,25,5);ctx.fillRect(x,H-50,25,5);}
        ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=2;ctx.setLineDash([30,30]);ctx.beginPath();ctx.moveTo(0,H-120);ctx.lineTo(W,H-120);ctx.stroke();ctx.setLineDash([]);
      } else if(t==='arctic'){
        ctx.fillStyle='#142d3d';ctx.fillRect(0,H-120,W,120);
        ctx.fillStyle='#e5edf1';ctx.beginPath();ctx.moveTo(0,H);ctx.lineTo(0,H-90);for(let x=0;x<=W;x+=60)ctx.lineTo(x,(H-90)+Math.sin(x*0.01)*8);ctx.lineTo(W,H);ctx.closePath();ctx.fill();
      } else if(t==='volcano'){
        ctx.fillStyle='#1e0802';ctx.fillRect(0,H-100,W,100);
        const g=ctx.createLinearGradient(0,H-90,0,H);g.addColorStop(0,'#ff4500');g.addColorStop(1,'#330a00');ctx.fillStyle=g;
        ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=30)ctx.lineTo(x,(H-85)+Math.sin(x*0.02+Date.now()*0.003)*10);ctx.lineTo(W,H);ctx.closePath();ctx.fill();
      }
    }

    // ── actors ───────────────────────────────────────────────────────────────
    function drawActors(t:string){
      if(t==='gamer') return;
      const now=Date.now();
      actors.forEach(a=>{
        ctx.save();
        if(a.role==='whale'){a.x+=a.speed;a.y+=Math.sin(now*0.001)*0.15;if(a.x>W+200)a.x=-200;}
        else if(a.role==='whale-shark'){a.x+=a.speed;a.y+=Math.sin(now*0.0008)*0.2;if(a.x>W+300)a.x=-300;}
        else if(a.role==='submarine'){a.x+=a.speed;a.y+=Math.sin(now*0.0005)*0.1;if(a.x<-300)a.x=W+300;}
        else if(a.role==='shark'){a.x+=a.speed;if(a.extra?.targets?.[0])a.y+=(a.extra.targets[0].y-a.y)*0.015;if(a.x>W+200)a.x=-200;}
        else if(a.role==='hunted-fish'){a.x+=a.speed;a.y+=Math.sin(now*0.004+a.x*0.01)*0.8;if(a.x>W+100)a.x=-100;}
        else if(a.role==='scuba-diver'){a.x+=a.speed;a.y+=Math.sin(now*0.002+a.x*0.04)*0.3;if(a.x>W+100)a.x=-100;}
        else if(a.role==='hiker'){a.x+=a.speed;a.y=H-110+Math.abs(Math.sin(a.x*0.05))*-5;if(a.x>W+50)a.x=-50;}
        else if(a.role==='airplane'||a.role==='forest-bird'){a.x+=a.speed;if(a.x>W+100)a.x=-100;}
        else if(a.role==='astronaut'){a.x+=a.speed;a.y+=a.extra.vy;a.extra.rot+=a.extra.rotSpeed;if(a.x>W+100)a.x=-100;if(a.x<-100)a.x=W+100;if(a.y>H-60||a.y<80)a.extra.vy*=-1;}
        else if(a.role==='sky-bird'){a.x+=a.speed;a.y+=a.extra.vy;if(a.x>W+50)a.x=-50;if(a.y<-20||a.y>H+20)a.extra.vy*=-1;}
        else if(a.role==='jump-plane'){a.x+=a.speed;}
        else if(a.role==='skydiver'){if(!a.extra.jumped){if(now-a.extra.spawnTime>a.extra.diverIdx*400+1200){a.extra.jumped=true;const pl=actors.find(x=>x.role==='jump-plane');if(pl){a.x=pl.x;a.y=pl.y;}}}else{a.x+=Math.sin(now*0.008+a.extra.diverIdx)*0.4;a.y+=a.speed;if(a.extra.isEarlyDeployer&&a.y>H*0.35&&!a.extra.deployed){a.extra.deployed=true;a.speed=1.1;}}}
        else if(a.role==='safari-jeep'||a.role==='camel'){a.x+=a.speed;a.y=(H-(a.role==='camel'?110:135))+Math.sin(a.x*0.006)*45;if(a.x>W+150)a.x=-150;}
        else if(a.role==='go-kart'){a.x+=(a.speed+Math.sin(now*0.003+a.extra.kartIdx)*1.6);a.y=a.extra.baseY+Math.sin(now*0.15+a.extra.kartIdx)*1.1;if(a.x>W+80)a.x=-80;}
        else if(a.role==='penguin'){a.x+=a.speed;a.y=H-85+Math.abs(Math.sin(a.x*0.1))*-3;if(a.x>W+50)a.x=-50;}
        else if(a.role==='arctic-walker'){a.x-=a.speed;a.y=H-85+Math.abs(Math.sin(a.x*0.2))*-4;if(a.x<-50)a.x=W+50;}
        else if(a.role==='dragon'){a.x+=a.speed;a.y+=Math.sin(now*0.002)*0.8;if(a.speed>0&&a.x>W+200)a.x=-200;if(a.speed<0&&a.x<-200)a.x=W+200;}
        else if(a.role==='magma-pod'){a.y=(H-65)+Math.sin(now*0.002+a.x)*5;}
        else if(a.role==='fantasy-jumper'){a.y+=a.speed;if(a.y>H+50)a.y=a.extra.startY;}
        ctx.translate(a.x,a.y);
        if(a.role==='astronaut')ctx.rotate(a.extra.rot);
        if(a.role==='safari-jeep')ctx.rotate(a.speed>0?Math.cos(a.x*0.006)*0.22:0);
        if(a.role==='whale'){ctx.fillStyle=t==='arctic'?'rgba(20,30,45,0.8)':'rgba(44,73,99,0.45)';ctx.beginPath();ctx.ellipse(0,0,a.size,a.size*0.4,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-a.size,0);ctx.lineTo(-a.size*1.3,-a.size*0.25);ctx.lineTo(-a.size*1.3,a.size*0.25);ctx.closePath();ctx.fill();}
        else if(a.role==='whale-shark'){ctx.fillStyle='rgba(40,60,80,0.7)';ctx.beginPath();ctx.ellipse(0,0,a.size,a.size*0.35,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-a.size+10,0);ctx.lineTo(-a.size-30,-30);ctx.lineTo(-a.size-30,30);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(0,-a.size*0.3);ctx.lineTo(-20,-a.size*0.7);ctx.lineTo(20,-a.size*0.3);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(255,255,255,0.5)';a.extra.spots.forEach((sp:any)=>{ctx.beginPath();ctx.arc(sp.x,sp.y,sp.r,0,Math.PI*2);ctx.fill();});}
        else if(a.role==='submarine'){ctx.fillStyle='#b89500';ctx.beginPath();ctx.ellipse(0,0,a.size,a.size*0.35,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8a7000';ctx.fillRect(-15,-a.size*0.6,30,a.size*0.4);ctx.fillRect(-5,-a.size*0.8,4,a.size*0.3);ctx.fillStyle='#555';ctx.fillRect(a.size,-5,10,10);ctx.fillStyle='#00ffff';ctx.beginPath();ctx.arc(-a.size*0.5,0,8,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(a.size*0.3,0,8,0,Math.PI*2);ctx.fill();const fl=ctx.createLinearGradient(-a.size,0,-a.size-150,0);fl.addColorStop(0,'rgba(255,255,180,0.4)');fl.addColorStop(1,'rgba(255,255,180,0)');ctx.fillStyle=fl;ctx.beginPath();ctx.moveTo(-a.size,0);ctx.lineTo(-a.size-150,-60);ctx.lineTo(-a.size-150,60);ctx.closePath();ctx.fill();}
        else if(a.role==='shark'){ctx.fillStyle='rgba(100,120,140,0.6)';ctx.beginPath();ctx.ellipse(0,0,a.size,a.size*0.3,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-5,-a.size*0.2);ctx.lineTo(-18,-a.size*0.65);ctx.lineTo(8,-a.size*0.2);ctx.fill();}
        else if(a.role==='hunted-fish'){ctx.fillStyle='rgba(64,165,190,0.7)';ctx.beginPath();ctx.ellipse(0,0,a.size,a.size*0.4,0,0,Math.PI*2);ctx.fill();}
        else if(a.role==='scuba-diver'){const fl=ctx.createLinearGradient(12,0,190,0);fl.addColorStop(0,'rgba(255,255,180,0.4)');fl.addColorStop(1,'rgba(255,255,180,0)');ctx.fillStyle=fl;ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(190,-65);ctx.lineTo(190,65);ctx.fill();ctx.fillStyle='#222';ctx.fillRect(-16,-6,26,12);ctx.fillStyle='#f4a261';ctx.beginPath();ctx.arc(12,-1,4,0,Math.PI*2);ctx.fill();}
        else if(a.role==='hiker'||a.role==='arctic-walker'){const c=a.role==='arctic-walker'?'#1d3557':'#c1121f';ctx.fillStyle=c;ctx.fillRect(-12,-24,8,16);ctx.fillStyle='#fdf0d5';ctx.beginPath();ctx.arc(0,-29,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#669bbc';ctx.fillRect(-6,-20,12,16);ctx.strokeStyle='#7f5539';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(8,-20);ctx.lineTo(10,8);ctx.stroke();}
        else if(a.role==='igloo'){ctx.fillStyle='#c8d9e6';ctx.beginPath();ctx.arc(0,0,a.size,Math.PI,0);ctx.fill();ctx.fillStyle='#142d3d';ctx.beginPath();ctx.arc(0,a.size*0.1,a.size*0.35,Math.PI,0);ctx.fill();}
        else if(a.role==='monkey'){ctx.strokeStyle='#5c3d2e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-40);ctx.lineTo(0,0);ctx.stroke();ctx.fillStyle='#79523c';ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,-11,7,0,Math.PI*2);ctx.fill();}
        else if(a.role==='forest-bird'||a.role==='sky-bird'){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();const fl=Math.sin(now*0.012+a.x*0.1)*6;ctx.moveTo(-8,fl);ctx.lineTo(0,0);ctx.lineTo(8,fl);ctx.stroke();}
        else if(a.role==='airplane'){ctx.fillStyle='rgba(255,255,255,0.75)';ctx.fillRect(-20,-2,40,4);ctx.fillRect(-4,-16,8,32);}
        else if(a.role==='astronaut'){ctx.fillStyle='#fff';ctx.fillRect(-10,-14,20,26);ctx.beginPath();ctx.arc(0,-20,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#00a1f1';ctx.beginPath();ctx.arc(0,-20,5,Math.PI,0);ctx.fill();}
        else if(a.role==='jump-plane'){ctx.fillStyle='#1e293b';ctx.fillRect(-40,-8,80,16);ctx.fillRect(-8,-35,16,70);}
        else if(a.role==='skydiver'&&a.extra?.jumped){if(a.extra.deployed){ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-28,-45);ctx.moveTo(0,0);ctx.lineTo(28,-45);ctx.stroke();ctx.fillStyle=a.extra.diverIdx%2===0?'#e63946':'#ffb703';ctx.beginPath();ctx.arc(0,-48,32,Math.PI,0);ctx.fill();}ctx.fillStyle='#1d3557';ctx.fillRect(-5,-12,10,22);ctx.fillStyle='#e63946';ctx.beginPath();ctx.arc(0,-15,4,0,Math.PI*2);ctx.fill();}
        else if(a.role==='safari-jeep'){ctx.fillStyle='#e76f51';ctx.fillRect(-18,-12,36,14);ctx.fillStyle='rgba(255,255,255,0.5)';ctx.fillRect(-10,-22,20,10);ctx.fillStyle='#111';ctx.beginPath();ctx.arc(-11,4,7,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(11,4,7,0,Math.PI*2);ctx.fill();}
        else if(a.role==='camel'){ctx.fillStyle='#b58253';ctx.fillRect(-15,-8,30,14);ctx.beginPath();ctx.arc(0,-12,8,Math.PI,0);ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#b58253';ctx.beginPath();ctx.moveTo(12,-4);ctx.lineTo(20,-18);ctx.lineTo(26,-16);ctx.stroke();}
        else if(a.role==='go-kart'){ctx.fillStyle='#111115';ctx.fillRect(-12,7,6,4);ctx.fillRect(8,7,6,4);ctx.fillRect(-13,-11,7,5);ctx.fillRect(9,-11,7,5);ctx.fillStyle=a.extra.color;ctx.fillRect(-8,-7,18,14);ctx.fillStyle='#111';ctx.fillRect(10,-5,3,10);ctx.fillRect(-11,-10,2,20);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(2,0,5,0,Math.PI*2);ctx.fill();}
        else if(a.role==='penguin'){ctx.fillStyle='#111622';ctx.beginPath();ctx.ellipse(0,0,a.size,a.size*0.75,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(2,0,a.size*0.7,a.size*0.5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffaa00';ctx.fillRect(a.size-2,-2,4,3);}
        else if(a.role==='dragon'){ctx.fillStyle=t==='fantasy'?'#5a189a':'#9e2a2b';ctx.beginPath();ctx.ellipse(0,0,a.size,a.size*0.35,0,0,Math.PI*2);ctx.fill();const fw=Math.sin(now*0.01)*a.size*0.6;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-10,-fw);ctx.lineTo(-25,0);ctx.lineTo(-10,fw);ctx.closePath();ctx.fill();}
        else if(a.role==='magma-pod'){const g=ctx.createRadialGradient(0,0,2,0,0,a.size);g.addColorStop(0,'#ffdd00');g.addColorStop(0.3,'#ff5500');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,a.size,0,Math.PI*2);ctx.fill();}
        else if(a.role==='floating-house'){ctx.fillStyle='#4a3b32';ctx.beginPath();ctx.moveTo(-a.size,0);ctx.lineTo(a.size,0);ctx.lineTo(a.size*0.4,a.size*0.6);ctx.lineTo(-a.size*0.4,a.size*0.6);ctx.closePath();ctx.fill();ctx.fillStyle='#38b000';ctx.beginPath();ctx.ellipse(0,-2,a.size,a.size*0.15,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d4a373';ctx.fillRect(-20,-35,40,35);ctx.fillStyle='#bc6c25';ctx.beginPath();ctx.moveTo(-25,-35);ctx.lineTo(0,-55);ctx.lineTo(25,-35);ctx.fill();ctx.fillStyle='#264653';ctx.fillRect(-5,-15,10,15);if(!a.extra.isJumpingHouse){ctx.fillStyle='#264653';ctx.fillRect(25,-15,8,14);ctx.fillStyle='#e9c46a';ctx.beginPath();ctx.arc(29,-19,5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e9c46a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(33,-13);ctx.lineTo(38,-18+Math.sin(now*0.008+a.extra.offset)*5);ctx.stroke();}}
        else if(a.role==='fantasy-jumper'){if(a.y>a.extra.startY+40){a.speed=0.8;ctx.fillStyle='#e63946';ctx.beginPath();ctx.arc(0,-25,20,Math.PI,0);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-20,-25);ctx.lineTo(0,0);ctx.moveTo(20,-25);ctx.lineTo(0,0);ctx.stroke();}else{a.speed=3.5;}ctx.fillStyle='#1d3557';ctx.fillRect(-4,0,8,12);ctx.fillStyle='#f4a261';ctx.beginPath();ctx.arc(0,-4,4,0,Math.PI*2);ctx.fill();}
        ctx.restore();
      });
    }

    // ── PAC-MAN TICK ────────────────────────────────────────────────────────
    const SPEED: Record<number,[number,number,number]> = {
      1:[10,13,20], 2:[9,11,18], 3:[8,9,16],
    };

    function tickPacman(e: EngineState) {
      if (e.state !== 'playing') return;
      const pac=e.pac, dots=e.pacDots, ghosts=e.ghosts;
      const lvl=Math.min(e.pacLevel,3) as 1|2|3;
      const [pacInterval,ghostInterval,ghostFrightInterval]=SPEED[lvl];

      pac.moveTimer++;
      if(pac.moveTimer>=pacInterval){
        pac.moveTimer=0;
        const qc=pac.col+pac.nextVx,qr=pac.row+pac.nextVy;
        if(!isWallTile(dots,qr,qc)){pac.vx=pac.nextVx;pac.vy=pac.nextVy;}
        const nc=pac.col+pac.vx,nr=pac.row+pac.vy;
        if(!isWallTile(dots,nr,nc)){pac.col=nc;pac.row=nr;}
        if(pac.col<0)pac.col=COLS-1;
        if(pac.col>=COLS)pac.col=0;
        const cell=dots[pac.row]?.[pac.col];
        if(cell===0){dots[pac.row][pac.col]=2;e.pacScore+=10;}
        else if(cell===3){
          dots[pac.row][pac.col]=2;e.pacScore+=50;
          e.frightenedTimer=FRIGHTENED_FRAMES;
          ghosts.forEach(g=>{if(g.respawnTimer<=0){g.frightened=true;g.vx=-g.vx;g.vy=-g.vy;}});
        }
      }

      if(e.frightenedTimer>0){
        e.frightenedTimer--;
        if(e.frightenedTimer<=0) ghosts.forEach(g=>{g.frightened=false;});
      }

      ghosts.forEach((g,gi)=>{
        if(g.respawnTimer>0){
          g.respawnTimer--;
          if(g.respawnTimer===0){g.col=9+(gi%2);g.row=7+Math.floor(gi/2);g.vx=gi%2===0?1:-1;g.vy=0;g.frightened=false;}
          return;
        }
        const interval=g.frightened?ghostFrightInterval:ghostInterval;
        e.ghostMoveTimer[gi]++;
        if(e.ghostMoveTimer[gi]<interval) return;
        e.ghostMoveTimer[gi]=0;
        const dirs=[{vx:1,vy:0},{vx:-1,vy:0},{vx:0,vy:1},{vx:0,vy:-1}];
        const valid=dirs.filter(d=>!isWallTile(dots,g.row+d.vy,g.col+d.vx));
        const noReverse=valid.filter(d=>!(d.vx===-g.vx&&d.vy===-g.vy));
        const pool=noReverse.length>0?noReverse:valid;
        if(g.frightened){
          const pick=pool[Math.floor(Math.random()*pool.length)];
          if(pick){g.vx=pick.vx;g.vy=pick.vy;}
        } else {
          const dx=pac.col-g.col,dy=pac.row-g.row;
          const sorted=[...pool].sort((a,b)=>(Math.abs(dx-a.vx)+Math.abs(dy-a.vy))-(Math.abs(dx-b.vx)+Math.abs(dy-b.vy)));
          const pick=Math.random()<0.7?sorted[0]:sorted[Math.floor(Math.random()*sorted.length)];
          if(pick){g.vx=pick.vx;g.vy=pick.vy;}
        }
        const nc=g.col+g.vx,nr=g.row+g.vy;
        if(!isWallTile(dots,nr,nc)){g.col=nc;g.row=nr;}
        else if(pool.length>0){const fb=pool[0];const fc=g.col+fb.vx,fr=g.row+fb.vy;if(!isWallTile(dots,fr,fc)){g.col=fc;g.row=fr;g.vx=fb.vx;g.vy=fb.vy;}}
        if(g.col<0)g.col=COLS-1;
        if(g.col>=COLS)g.col=0;
        const dist=Math.abs(pac.col-g.col)+Math.abs(pac.row-g.row);
        if(dist<=1){
          if(g.frightened){g.frightened=false;g.respawnTimer=RESPAWN_FRAMES;e.pacScore+=200;e.ghostMoveTimer[gi]=0;}
          else{e.state='gameover';if(e.pacScore>e.pacHighScore){e.pacHighScore=e.pacScore;localStorage.setItem('pacmanHighScore',String(e.pacHighScore));}}
        }
      });

      const remaining=e.pacDots.flat().filter(v=>v===0||v===3).length;
      if(remaining===0){
        if(e.pacLevel>=3){e.state='congrats';e.congratsTimer=0;if(e.pacScore>e.pacHighScore){e.pacHighScore=e.pacScore;localStorage.setItem('pacmanHighScore',String(e.pacHighScore));}}
        else{e.state='levelcomplete';e.levelTimer=0;}
      }
    }

    // ── DRAW PAC-MAN ────────────────────────────────────────────────────────
    function drawPacman(e: EngineState) {
      const pac=e.pac,dots=e.pacDots,ghosts=e.ghosts,now=Date.now();
      ctx.fillStyle='#000';ctx.fillRect(0,0,VW,VH);
      dots.forEach((row,r)=>row.forEach((cell,c)=>{
        if(cell===1){ctx.fillStyle='#1919A6';ctx.fillRect(c*CELL,r*CELL,CELL,CELL);ctx.fillStyle='#000';ctx.fillRect(c*CELL+4,r*CELL+4,32,32);}
        else if(cell===0){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(c*CELL+HALF,r*CELL+HALF,3,0,Math.PI*2);ctx.fill();}
        else if(cell===3){const pulse=Math.sin(now*0.008)*2+6;ctx.fillStyle='#ffff00';ctx.shadowColor='#ffff00';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(c*CELL+HALF,r*CELL+HALF,pulse,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
      }));
      const px=tileToPixel(pac.col),py=tileToPixel(pac.row);
      const angle=Math.atan2(pac.vy,pac.vx);
      const mouthA=e.state==='playing'?Math.abs(Math.sin(now*0.015))*0.45+0.05:0.05;
      ctx.fillStyle='yellow';ctx.beginPath();ctx.arc(px,py,14,angle+mouthA,angle+Math.PI*2-mouthA);ctx.lineTo(px,py);ctx.fill();
      ghosts.forEach(g=>{
        if(g.respawnTimer>0) return;
        const gx=tileToPixel(g.col),gy=tileToPixel(g.row);
        const blink=e.frightenedTimer<=80&&Math.floor(now/180)%2===0;
        const gColor=g.frightened?(blink?'#ffffff':'#0000cc'):g.color;
        ctx.fillStyle=gColor;
        ctx.beginPath();ctx.arc(gx,gy-2,14,Math.PI,0);ctx.lineTo(gx+14,gy+14);ctx.lineTo(gx+7,gy+10);ctx.lineTo(gx,gy+14);ctx.lineTo(gx-7,gy+10);ctx.lineTo(gx-14,gy+14);ctx.fill();
        if(!g.frightened){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(gx-5,gy-5,4,0,Math.PI*2);ctx.arc(gx+5,gy-5,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#00f';ctx.beginPath();ctx.arc(gx-5+g.vx*2,gy-5+g.vy*2,2,0,Math.PI*2);ctx.arc(gx+5+g.vx*2,gy-5+g.vy*2,2,0,Math.PI*2);ctx.fill();}
      });
      ctx.fillStyle='yellow';ctx.font='bold 22px monospace';ctx.textAlign='left';ctx.fillText(`SCORE: ${e.pacScore}`,20,30);
      ctx.textAlign='right';ctx.fillText(`BEST: ${e.pacHighScore}`,VW-20,30);
      ctx.textAlign='center';ctx.fillText(`LEVEL ${e.pacLevel}`,VW/2,30);
      if(e.frightenedTimer>0){
        const bw=(e.frightenedTimer/FRIGHTENED_FRAMES)*(VW-40);
        ctx.fillStyle='rgba(0,0,200,0.3)';ctx.fillRect(20,VH-18,VW-40,8);
        ctx.fillStyle=e.frightenedTimer<=80?'#ff4444':'#4488ff';ctx.fillRect(20,VH-18,bw,8);
        ctx.fillStyle='white';ctx.font='bold 13px monospace';ctx.textAlign='left';ctx.fillText('⚡ POWER!',20,VH-22);
      }
    }

    // ── GAMER ROOM ENGINE ────────────────────────────────────────────────────
    function runGamer() {
      const e=engineRef.current;
      const growing=e.state==='expanding'||e.state==='playing'||e.state==='gameover'||e.state==='levelcomplete'||e.state==='congrats';
      if(growing) e.tvExpandFactor=Math.min(1,e.tvExpandFactor+0.05);
      else if(e.state==='shrinking'){e.tvExpandFactor=Math.max(0,e.tvExpandFactor-0.05);if(e.tvExpandFactor<=0)e.state='idle';}
      if(e.state==='expanding'&&e.tvExpandFactor>=1) e.state='playing';

      if(e.state==='levelcomplete'){
        e.levelTimer++;
        if(e.levelTimer>150){
          const next=e.pacLevel+1,score=e.pacScore,hi=e.pacHighScore;
          resetPacLevel(e,next); e.pacScore=score; e.pacHighScore=hi; e.state='playing';
        }
      }
      if(e.state==='congrats') e.congratsTimer++;

      if(e.activeGame==='flappy'){
        const f=e.flappy,FH=80;
        if(e.state==='playing'){
          f.birdVelocity+=f.gravity;f.birdY+=f.birdVelocity;f.pipeSpawnTimer++;
          if(f.pipeSpawnTimer>90){f.pipeSpawnTimer=0;const gap=160,tH=Math.floor(Math.random()*(VH-FH-gap-60))+60;f.pipes.push({x:VW,topHeight:tH,passed:false});}
          for(const p of f.pipes){p.x-=f.pipeSpeed;if(!p.passed&&p.x<200){p.passed=true;f.score++;}if(p.x<216&&p.x+80>184&&(f.birdY-16<p.topHeight||f.birdY+16>p.topHeight+160)){e.state='gameover';if(f.score>f.highScore){f.highScore=f.score;localStorage.setItem('flappyHighScore',String(f.highScore));}}}
          f.pipes=f.pipes.filter(p=>p.x>-100);
          if(f.birdY>VH-FH-16||f.birdY<16){e.state='gameover';if(f.score>f.highScore){f.highScore=f.score;localStorage.setItem('flappyHighScore',String(f.highScore));}}
        } else if(e.state==='idle'||e.state==='shrinking'||e.state==='expanding'){f.birdY=250+Math.sin(Date.now()*0.005)*20;f.birdVelocity=0;}
        else if(e.state==='gameover'&&f.birdY<VH-FH-16){f.birdVelocity+=f.gravity;f.birdY+=f.birdVelocity;}
      } else { tickPacman(e); }

      ctx.fillStyle='#0a0a0d';ctx.fillRect(0,H*0.65,W,H*0.35);
      const mobile=W<768;
      const bTW=Math.min(380,W*0.85),bTH=260;
      const bTX=mobile?(W/2)-(bTW/2):(W*0.7)-(bTW/2);
      const bTY=mobile?H*0.2:(H*0.5)-(bTH/2);
      const pad=mobile?15:40;
      const tvW=bTW+(W-pad*2-bTW)*e.tvExpandFactor;
      const tvH=bTH+(H-pad*2-bTH)*e.tvExpandFactor;
      const tvX=bTX+(pad-bTX)*e.tvExpandFactor;
      const tvY=bTY+(pad-bTY)*e.tvExpandFactor;
      ctx.shadowColor=e.activeGame==='flappy'?'#70c5ce':'#1919A6';
      ctx.shadowBlur=40*(1-e.tvExpandFactor);
      ctx.fillStyle='#151515';ctx.fillRect(tvX-15,tvY-15,tvW+30,tvH+30);
      ctx.shadowBlur=0;
      ctx.save();ctx.beginPath();ctx.rect(tvX,tvY,tvW,tvH);ctx.clip();
      ctx.translate(tvX,tvY);ctx.scale(tvW/VW,tvH/VH);

      if(e.activeGame==='flappy'){
        const f=e.flappy;
        ctx.fillStyle='#70c5ce';ctx.fillRect(0,0,VW,VH);
        for(const p of f.pipes){ctx.fillStyle='#73bf2e';ctx.strokeStyle='#53801e';ctx.lineWidth=4;ctx.fillRect(p.x,0,80,p.topHeight);ctx.strokeRect(p.x,0,80,p.topHeight);ctx.fillRect(p.x-4,p.topHeight-30,88,30);ctx.strokeRect(p.x-4,p.topHeight-30,88,30);const bY=p.topHeight+160;ctx.fillRect(p.x,bY,80,VH-80-bY);ctx.strokeRect(p.x,bY,80,VH-80-bY);ctx.fillRect(p.x-4,bY,88,30);ctx.strokeRect(p.x-4,bY,88,30);}
        const off=e.state!=='gameover'?(Date.now()*0.15)%40:0;
        ctx.fillStyle='#ded895';ctx.fillRect(0,VH-80,VW,80);ctx.fillStyle='#73bf2e';ctx.fillRect(0,VH-80,VW,15);
        ctx.strokeStyle='#c0b769';ctx.lineWidth=4;ctx.beginPath();for(let i=-40;i<VW;i+=40){ctx.moveTo(i-off+20,VH-80+25);ctx.lineTo(i-off,VH);}ctx.stroke();
        ctx.save();ctx.translate(200,f.birdY);
        const rot=Math.min(Math.max(f.birdVelocity*0.05,-0.4),0.7);ctx.rotate(rot);
        ctx.fillStyle='#f7d138';ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(5,-6,5,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle='#000';ctx.beginPath();ctx.arc(6,-6,2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#e67e22';ctx.beginPath();ctx.moveTo(12,-2);ctx.lineTo(24,2);ctx.lineTo(12,6);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle='#f39c12';ctx.beginPath();ctx.ellipse(-6,2,8,5,0,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.restore();
        ctx.fillStyle='#fff';ctx.strokeStyle='#000';ctx.lineWidth=6;ctx.font='bold 60px sans-serif';ctx.textAlign='center';
        if(e.state==='playing'||e.state==='gameover'){ctx.strokeText(String(f.score),VW/2,120);ctx.fillText(String(f.score),VW/2,120);ctx.font='bold 24px sans-serif';ctx.lineWidth=3;ctx.strokeText(`BEST: ${f.highScore}`,VW/2,160);ctx.fillText(`BEST: ${f.highScore}`,VW/2,160);}
      } else { drawPacman(e); }

      // Overlays
      if(e.state==='idle'||e.state==='expanding'){
        ctx.fillStyle=`rgba(255,255,255,${Math.abs(Math.sin(Date.now()*0.003))})`;
        ctx.font='bold 40px sans-serif';ctx.textAlign='center';
        ctx.fillText(e.activeGame==='flappy'?'TAP OR SPACE TO PLAY':'TAP TO START  ←↑→↓',VW/2,VH/2+50);
      } else if(e.state==='gameover'){
        ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(0,0,VW,VH);
        ctx.fillStyle='#ff4757';ctx.font='bold 60px sans-serif';ctx.textAlign='center';ctx.fillText('GAME OVER',VW/2,VH/2-20);
        ctx.fillStyle='#fff';ctx.font='bold 28px sans-serif';ctx.fillText('TAP TO RESTART',VW/2,VH/2+40);
        if(e.activeGame==='pacman'){ctx.fillStyle='yellow';ctx.font='bold 22px monospace';ctx.fillText(`SCORE: ${e.pacScore}   BEST: ${e.pacHighScore}`,VW/2,VH/2+90);}
      } else if(e.state==='levelcomplete'){
        ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(0,0,VW,VH);
        for(let s=0;s<8;s++){const sx=100+s*85;const sy=VH/2-120+Math.sin(Date.now()*0.003+s)*15;ctx.fillStyle=`hsl(${(s*45+Date.now()*0.1)%360},100%,70%)`;ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('★',sx,sy);}
        ctx.fillStyle='#ffff00';ctx.font='bold 58px sans-serif';ctx.textAlign='center';ctx.fillText(`LEVEL ${e.pacLevel} CLEAR!`,VW/2,VH/2-10);
        ctx.fillStyle='#00ff88';ctx.font='bold 30px sans-serif';ctx.fillText(`Get Ready for Level ${e.pacLevel+1}…`,VW/2,VH/2+50);
        ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='bold 22px monospace';ctx.fillText(`SCORE: ${e.pacScore}`,VW/2,VH/2+95);
      } else if(e.state==='congrats'){
        const timer=e.congratsTimer;
        ctx.fillStyle='rgba(0,0,0,0.88)';ctx.fillRect(0,0,VW,VH);
        for(let c=0;c<30;c++){const cx=(Math.sin(c*137.5+timer*0.05)*0.5+0.5)*VW;const cy=((timer*0.8+c*60)%(VH+40))-20;ctx.fillStyle=`hsl(${(c*47+timer)%360},100%,65%)`;ctx.fillRect(cx,cy,8,8);}
        ctx.font='80px sans-serif';ctx.textAlign='center';ctx.fillText('🏆',VW/2,VH/2-130);
        ctx.shadowColor='#ffff00';ctx.shadowBlur=30;
        ctx.fillStyle='#ffff00';ctx.font='bold 62px sans-serif';ctx.fillText('YOU WIN!',VW/2,VH/2-30);
        ctx.shadowBlur=0;
        ctx.fillStyle='#00ff88';ctx.font='bold 30px sans-serif';ctx.fillText('All 3 Levels Completed!',VW/2,VH/2+30);
        ctx.fillStyle='#fff';ctx.font='bold 24px monospace';ctx.fillText(`FINAL SCORE: ${e.pacScore}`,VW/2,VH/2+80);
        ctx.fillStyle='rgba(255,220,0,0.9)';ctx.font='bold 20px monospace';ctx.fillText(`HIGH SCORE: ${e.pacHighScore}`,VW/2,VH/2+115);
        ctx.fillStyle=`rgba(255,255,255,${Math.abs(Math.sin(Date.now()*0.003))})`;ctx.font='bold 22px sans-serif';ctx.fillText('TAP TO PLAY AGAIN',VW/2,VH/2+165);
      }
      ctx.restore();

      // Gamer boy
      if(e.tvExpandFactor<1){
        ctx.globalAlpha=1-e.tvExpandFactor;
        const bX=mobile?(W/2)-60:bTX-140;
        const bY=mobile?H-120:bTY+bTH+30;
        ctx.save();ctx.translate(bX,bY);
        ctx.fillStyle='#0c0c11';ctx.beginPath();ctx.ellipse(0,0,50,20,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#050508';
        ctx.beginPath();ctx.moveTo(-20,0);ctx.lineTo(10,0);ctx.lineTo(25,-45);ctx.lineTo(-10,-55);ctx.fill();
        ctx.beginPath();ctx.arc(15,-65,16,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(35,-20);ctx.lineTo(55,0);ctx.lineTo(10,0);ctx.fill();
        ctx.strokeStyle='#050508';ctx.lineWidth=10;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(5,-40);ctx.lineTo(25,-25);ctx.lineTo(40,-32);ctx.stroke();
        ctx.fillStyle='#00ffff';ctx.shadowColor='#00ffff';ctx.shadowBlur=12;ctx.fillRect(36,-35,10,6);
        ctx.restore();ctx.globalAlpha=1;
      }
    }

    // ── MAIN LOOP ────────────────────────────────────────────────────────────
    function loop() {
      const t = THEMES[themeIndexRef.current];
      ctx.clearRect(0, 0, W, H);
      if (t === 'gamer') { particles.forEach(p => { p.update(W,H); p.draw(ctx); }); runGamer(); }
      else { drawScenery(t); particles.forEach(p => { p.update(W,H); p.draw(ctx); }); drawActors(t); }
      animId = requestAnimationFrame(loop);
    }

    buildEnv();
    loop();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, [themeIndex]);

  const isGamerMode = THEMES[themeIndex] === 'gamer';

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative transition-all duration-1000 ease-in-out font-sans select-none overflow-hidden"
      style={{ background: THEME_GRADIENTS[THEMES[themeIndex]] }}
      onClick={handleGameInput}
    >
      <canvas
        ref={canvasRef}
        className={`fixed top-0 left-0 w-full h-full z-0 ${isGamerMode ? 'cursor-pointer' : ''}`}
      />

      {/* ── Back / destination badges ── */}
      <div
        onClick={e => { e.stopPropagation(); if (window.innerWidth < 768) shiftTheme(1); }}
        className={`absolute top-6 left-[30px] z-20 text-[13px] font-medium tracking-[0.5px] px-[18px] py-[8px] rounded-[30px] border border-white/10 backdrop-blur-[5px] bg-black/40 text-white/85 shadow-md max-md:cursor-pointer transition-all duration-500 ${isGameActive ? 'opacity-0 -translate-y-4' : 'opacity-100'}`}
      >
        Environment:{" "}
        <span className="font-bold text-[#00a1f1] uppercase">{THEME_NAMES[themeIndex]}</span>
        <span className="text-[10px] text-white/40 block md:hidden text-center mt-0.5 font-normal">(Tap to change)</span>
      </div>

      {/* ── Flappy / Pac-Man toggle (gamer + idle) ── */}
      {isGamerMode && !isGameActive && (
        <div className="absolute top-[30px] right-[30px] z-20 flex gap-2" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => switchSubGame('flappy')}
            className={`text-[12px] font-bold tracking-[0.5px] px-[16px] py-[8px] rounded-[30px] shadow-md uppercase transition-colors ${activeSubGame === 'flappy' ? 'bg-amber-500 text-slate-900' : 'bg-black/40 text-white border border-white/20 hover:bg-black/60'}`}
          >Flappy Bird</button>
          <button
            onClick={() => switchSubGame('pacman')}
            className={`text-[12px] font-bold tracking-[0.5px] px-[16px] py-[8px] rounded-[30px] shadow-md uppercase transition-colors ${activeSubGame === 'pacman' ? 'bg-[#ffdb00] text-slate-900' : 'bg-black/40 text-white border border-white/20 hover:bg-black/60'}`}
          >Pac-Man</button>
        </div>
      )}

      {/* ── ESC hint ── */}
      {isGameActive && (
        <div
          onClick={e => { e.stopPropagation(); setIsGameActive(false); engineRef.current.state = 'shrinking'; }}
          className="absolute top-[30px] right-[30px] z-20 text-[12px] font-bold tracking-[0.5px] px-[16px] py-[8px] rounded-[30px] bg-black/50 border border-white/20 text-white/90 shadow-md uppercase backdrop-blur-md cursor-pointer hover:bg-black/70 transition-colors"
        >Press ESC to Exit</div>
      )}

      {/* ── Mobile D-Pad ── */}
      {isGameActive && activeSubGame === 'pacman' && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 grid grid-cols-3 gap-1 md:hidden"
          onClick={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          <div />
          <button className="w-14 h-14 rounded-xl bg-white/15 border border-white/25 backdrop-blur-sm text-white text-2xl flex items-center justify-center active:bg-white/35 select-none"
            onTouchStart={e => { e.stopPropagation(); e.preventDefault(); engineRef.current.pac.nextVx=0; engineRef.current.pac.nextVy=-1; }}>▲</button>
          <div />
          <button className="w-14 h-14 rounded-xl bg-white/15 border border-white/25 backdrop-blur-sm text-white text-2xl flex items-center justify-center active:bg-white/35 select-none"
            onTouchStart={e => { e.stopPropagation(); e.preventDefault(); engineRef.current.pac.nextVx=-1; engineRef.current.pac.nextVy=0; }}>◀</button>
          <button className="w-14 h-14 rounded-xl bg-white/15 border border-white/25 backdrop-blur-sm text-white text-2xl flex items-center justify-center active:bg-white/35 select-none"
            onTouchStart={e => { e.stopPropagation(); e.preventDefault(); engineRef.current.pac.nextVx=0; engineRef.current.pac.nextVy=1; }}>▼</button>
          <button className="w-14 h-14 rounded-xl bg-white/15 border border-white/25 backdrop-blur-sm text-white text-2xl flex items-center justify-center active:bg-white/35 select-none"
            onTouchStart={e => { e.stopPropagation(); e.preventDefault(); engineRef.current.pac.nextVx=1; engineRef.current.pac.nextVy=0; }}>▶</button>
        </div>
      )}

      {/* ── Flappy tap hint ── */}
      {isGameActive && activeSubGame === 'flappy' && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 md:hidden pointer-events-none">
          <div className="text-white/50 text-[13px] font-medium bg-black/30 px-4 py-2 rounded-full backdrop-blur-sm">
            TAP SCREEN TO FLAP
          </div>
        </div>
      )}

      {/* ── Glassmorphism card ── */}
     <div
  className={`relative z-10 w-[420px] max-w-full px-[40px] py-[45px] bg-white/5 backdrop-blur-[20px] border border-white/15 rounded-[24px] shadow-[0_25px_60px_rgba(0,0,0,0.45)] text-center text-white m-4 transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]
    ${isGameActive
      ? 'opacity-0 scale-90 translate-y-8 pointer-events-none'
      : 'opacity-100 scale-100 translate-y-0 pointer-events-auto'}
    ${isGamerMode && !isGameActive ? 'md:-translate-x-[20vw]' : 'translate-x-0'}`}
  onClick={e => e.stopPropagation()}
>
        {/* Logo */}
        <div className="mx-auto mb-5 h-20 w-20 rounded-full bg-white/95 border border-white/20 flex items-center justify-center overflow-hidden shadow-inner">
          <img src="/tsu-logo.png" alt="TSU" className="h-full w-full object-contain p-1" />
        </div>

        <h1 className="text-[26px] font-bold mb-[10px] tracking-[0.5px] drop-shadow-[0_2px_10px_rgba(0,0,0,0.3)] text-white">
          Scheduling System
        </h1>
        <p className="text-[14px] text-white/65 mb-[40px] leading-[1.4]">
          Sign in with your Microsoft account to continue.
        </p>

        <button
          onClick={() => { setBusy(true); signIn().catch((e: any) => toast.error(e?.message ?? 'Sign-in failed')).finally(() => setBusy(false)); }}
          disabled={busy || loading}
          className="inline-flex items-center justify-center w-full py-[14px] px-[20px] bg-[#2f2f2f] text-white border border-white/15 text-[15px] font-semibold cursor-pointer rounded-[6px] shadow-[0_4px_15px_rgba(0,0,0,0.25)] transition-all duration-[250ms] hover:bg-[#3d3d3d] hover:-translate-y-[2px] hover:border-white/30 active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          <svg className="w-[18px] h-[18px] mr-[14px] shrink-0" viewBox="0 0 23 23">
            <rect x="0"  y="0"  width="11" height="11" fill="#f25022" />
            <rect x="12" y="0"  width="11" height="11" fill="#7fba00" />
            <rect x="0"  y="12" width="11" height="11" fill="#00a1f1" />
            <rect x="12" y="12" width="11" height="11" fill="#ffb900" />
          </svg>
          <span>{busy ? 'Signing in…' : 'Sign in with Microsoft'}</span>
        </button>

        <p className="mt-5 text-[12px] text-white/45 leading-relaxed">
          Any Microsoft account works.{" "}
          <span className="text-white/60">Admins are directed to the admin dashboard.</span>
        </p>

        {/* Keyboard hint */}
        <div className="mt-[35px] text-[12px] text-white/45 hidden lg:block">
          Press{" "}
          <kbd className="bg-white/20 rounded-[4px] py-[2px] px-[6px] text-[11px] border border-white/25 mx-[2px]">←</kbd>
          {" "}or{" "}
          <kbd className="bg-white/20 rounded-[4px] py-[2px] px-[6px] text-[11px] border border-white/25 mx-[2px]">→</kbd>
          {" "}to change environment
          {isGamerMode && (
            <span className="block mt-1">
              Press{" "}
              <kbd className="bg-white/20 rounded-[4px] py-[2px] px-[6px] text-[11px] border border-white/25 mx-[2px]">Space</kbd>
              {" "}or tap anywhere to play
            </span>
          )}
        </div>
      </div>
    </div>
  );
}