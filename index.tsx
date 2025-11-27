
import React, { useState, useEffect, useMemo, createContext, useContext, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { 
  Upload, 
  Trash2, 
  Users, 
  Trophy, 
  Swords, 
  LayoutDashboard, 
  Activity,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Gamepad2,
  BarChart2,
  X,
  Crosshair,
  Bomb,
  Target,
  Shield,
  Shuffle,
  Ban,
  Users2,
  ExternalLink,
  Flame,
  Footprints,
  Skull,
  Zap,
  Lock,
  LogOut,
  Save,
  RefreshCw,
  CheckSquare,
  Square,
  Calendar,
  Medal,
  ChevronRight,
  Settings,
  Database,
  Cloud,
  HardDrive
} from 'lucide-react';

// --- Types ---

interface DuelData {
  opponent_name: string;
  kills: number;
  deaths: number;
  diff: number;
}

interface PlayerStats {
  name: string;
  steam_id: number | string;
  last_team_name: string;
  last_side: string;
  duels: { [key: string]: DuelData };
  kills: number;
  deaths: number;
  assists: number;
  rounds_played: number;
  damage_total: number;
  opening_kills: number;
  opening_deaths: number;
  opening_attempts: number;
  sniper_kills: number;
  utility_damage: number;
  flashes_thrown: number;
  hltv_3_0_score: number;
  trade_kills?: number;
  clutches_won_1v1?: number;
  clutches_won_1v2?: number;
  clutches_won_1v3?: number;
  clutches_won_1v4?: number;
  clutches_won_1v5?: number;
}

interface Match {
  id: string;
  filename: string;
  timestamp: number;
  data: PlayerStats[];
}

interface AggregatedPlayerStats {
  steam_id: string;
  name: string;
  matches: number;
  kills: number;
  deaths: number;
  assists: number;
  rounds_played: number;
  damage_total: number;
  hltv_3_0_score: number;
  sniper_kills: number;
  utility_damage: number;
  flashes_thrown: number;
  opening_kills: number;
  opening_deaths: number;
  opening_attempts: number;
  trade_kills: number;
  clutches_won: number;
  [key: string]: any;
}

type SortConfig = {
  key: keyof AggregatedPlayerStats;
  direction: 'asc' | 'desc';
} | null;

interface StatsContextType {
  matches: Match[];
  addMatch: (match: Match) => Promise<void>;
  addMatches: (matches: Match[]) => Promise<void>;
  deleteMatch: (matchId: string) => Promise<void>;
  deleteMatches: (matchIds: string[]) => Promise<void>;
  restoreData: (matches: Match[]) => Promise<void>;
  loading: boolean;
  allPlayers: AggregatedPlayerStats[];
  dbType: 'local' | 'firebase';
  setFirebaseConfig: (config: any) => void;
}

interface AuthContextType {
    isAdmin: boolean;
    login: (password: string) => boolean;
    logout: () => void;
}

// --- IndexedDB Utils ---
const IDB_NAME = 'CS_Stats_DB';
const IDB_VERSION = 1;
const STORE_MATCHES = 'matches';

const idbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined') return;
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_MATCHES)) {
            db.createObjectStore(STORE_MATCHES, { keyPath: 'id' });
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const dbOps = {
    getAll: async (): Promise<Match[]> => {
        const db = await idbPromise;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_MATCHES, 'readonly');
            const request = tx.objectStore(STORE_MATCHES).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    add: async (match: Match) => {
        const db = await idbPromise;
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_MATCHES, 'readwrite');
            const request = tx.objectStore(STORE_MATCHES).put(match);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    addBulk: async (matches: Match[]) => {
        const db = await idbPromise;
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_MATCHES, 'readwrite');
            const store = tx.objectStore(STORE_MATCHES);
            matches.forEach(m => store.put(m));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
    delete: async (id: string) => {
        const db = await idbPromise;
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_MATCHES, 'readwrite');
            const request = tx.objectStore(STORE_MATCHES).delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    deleteBulk: async (ids: string[]) => {
        const db = await idbPromise;
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_MATCHES, 'readwrite');
            const store = tx.objectStore(STORE_MATCHES);
            ids.forEach(id => store.delete(id));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
    clear: async () => {
        const db = await idbPromise;
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_MATCHES, 'readwrite');
            const request = tx.objectStore(STORE_MATCHES).clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// --- Context ---
const StatsContext = createContext<StatsContextType>({
  matches: [],
  addMatch: async () => {},
  addMatches: async () => {},
  deleteMatch: async () => {},
  deleteMatches: async () => {},
  restoreData: async () => {},
  loading: true,
  allPlayers: [],
  dbType: 'local',
  setFirebaseConfig: () => {}
});

const AuthContext = createContext<AuthContextType>({
    isAdmin: false,
    login: () => false,
    logout: () => {}
});

const useStats = () => useContext(StatsContext);
const useAuth = () => useContext(AuthContext);

// --- Helper Functions ---

const aggregatePlayerStats = (matches: Match[]): AggregatedPlayerStats[] => {
  const playerMap: { [key: string]: AggregatedPlayerStats } = {};

  matches.forEach(match => {
    match.data.forEach(player => {
      const steamIdStr = player.steam_id.toString();
      if (!playerMap[steamIdStr]) {
        playerMap[steamIdStr] = {
          steam_id: steamIdStr,
          name: player.name,
          matches: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          rounds_played: 0,
          damage_total: 0,
          hltv_3_0_score: 0,
          sniper_kills: 0,
          utility_damage: 0,
          flashes_thrown: 0,
          opening_kills: 0,
          opening_deaths: 0,
          opening_attempts: 0,
          trade_kills: 0,
          clutches_won: 0,
        };
      }
      const p = playerMap[steamIdStr];
      p.name = player.name; // Update to latest name
      p.matches += 1;
      p.kills += player.kills;
      p.deaths += player.deaths;
      p.assists += player.assists;
      p.rounds_played += player.rounds_played;
      p.damage_total += player.damage_total;
      p.hltv_3_0_score += player.hltv_3_0_score;
      p.sniper_kills += player.sniper_kills;
      p.utility_damage += player.utility_damage;
      p.flashes_thrown += player.flashes_thrown;
      p.opening_kills += player.opening_kills;
      p.opening_deaths += player.opening_deaths;
      p.opening_attempts += player.opening_attempts;
      
      p.trade_kills += player.trade_kills || 0;
      
      const clutches = (player.clutches_won_1v1 || 0) + 
                       (player.clutches_won_1v2 || 0) + 
                       (player.clutches_won_1v3 || 0) + 
                       (player.clutches_won_1v4 || 0) + 
                       (player.clutches_won_1v5 || 0);
      p.clutches_won += clutches;
    });
  });

  return Object.values(playerMap);
};

const parseDateFromFilename = (filename: string): number => {
    const tenDigitMatch = filename.match(/(\d{10})/);
    if (tenDigitMatch) {
        const sequence = tenDigitMatch[1];
        const yy = parseInt(sequence.substring(0, 2), 10);
        const mm = parseInt(sequence.substring(2, 4), 10);
        const dd = parseInt(sequence.substring(4, 6), 10);
        const hh = parseInt(sequence.substring(6, 8), 10);
        const mi = parseInt(sequence.substring(8, 10), 10);
        const year = yy + 2000;

        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && hh >= 0 && hh <= 23 && mi >= 0 && mi <= 59) {
            const date = new Date(year, mm - 1, dd, hh, mi);
            if (!isNaN(date.getTime())) {
                return date.getTime();
            }
        }
    }
    const yyyymmddMatch = filename.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
    if (yyyymmddMatch) {
        const date = new Date(`${yyyymmddMatch[1]}-${yyyymmddMatch[2]}-${yyyymmddMatch[3]}`);
        if (!isNaN(date.getTime())) {
            return date.getTime();
        }
    }
    return Date.now();
};

const getWeaponRole = (player: PlayerStats | AggregatedPlayerStats): 'Sniper' | 'Rifler' => {
  const totalKills = player.kills;
  const sniperKills = player.sniper_kills;
  if (totalKills === 0) return 'Rifler';
  const sniperPercentage = (sniperKills / totalKills) * 100;
  return sniperPercentage > 40 ? 'Sniper' : 'Rifler';
};

// --- UI Components ---

const Card: React.FC<{ children?: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-app-card border border-gray-700/50 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 ${className}`}>
    {children}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-end md:items-center z-50 md:p-4" onClick={onClose}>
      <div className="bg-app-card border border-gray-700 rounded-t-2xl md:rounded-xl shadow-2xl w-full max-w-5xl h-[95vh] md:max-h-[90vh] flex flex-col animate-slide-up md:animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-app-card rounded-t-xl sticky top-0 z-10">
          <h2 className="text-xl font-bold text-app-text truncate pr-4">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700 transition-colors"><X size={20} /></button>
        </div>
        <div className="p-4 md:p-6 overflow-y-auto flex-grow custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

const AuthModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    const { login } = useAuth();
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    if (!isOpen) return null;
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (login(password)) {
            setError(false);
            setPassword('');
            onClose();
        } else {
            setError(true);
        }
    };
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-app-card border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm p-8" onClick={e => e.stopPropagation()}>
                <div className="flex justify-center mb-6 text-app-accent">
                    <div className="p-4 bg-app-accent/10 rounded-full"><Shield size={40} /></div>
                </div>
                <h2 className="text-2xl font-bold text-white text-center mb-6">Admin Access</h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-app-textMuted mb-2">Password</label>
                        <input 
                            type="password" 
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent transition-all"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                        />
                        {error && <p className="text-app-danger text-sm mt-2 flex items-center"><Ban size={14} className="mr-1"/> Incorrect password</p>}
                    </div>
                    <button type="submit" className="w-full bg-app-accent text-white font-bold py-3 rounded-lg hover:bg-app-accentHover transition-colors shadow-lg shadow-app-accent/20">Login</button>
                </form>
            </div>
        </div>
    );
};

const Tooltip = ({ text, children }: { text: string; children?: React.ReactNode }) => (
  <div className="relative group flex items-center">
    {children}
    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max px-2 py-1 bg-gray-900 border border-gray-700 text-white text-xs rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 hidden md:block">
      {text}
    </div>
  </div>
);

const SteamProfileLink = ({ steamId, children, className = '' }: { steamId: string; children?: React.ReactNode; className?: string }) => (
  <a
    href={`https://steamcommunity.com/profiles/${steamId}`}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex items-center gap-1.5 hover:text-app-accent transition-colors ${className}`}
    onClick={(e) => e.stopPropagation()}
  >
    {children}
    <ExternalLink size={12} className="opacity-50" />
  </a>
);

// --- Components ---

const SortableTable = ({ players, onPlayerClick }: { players: AggregatedPlayerStats[], onPlayerClick: (steamId: string) => void }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'hltv_3_0_score', direction: 'desc' });
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

    const sortedPlayers = useMemo(() => {
        let sortablePlayers = [...players];
        if (sortConfig !== null) {
            sortablePlayers.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];
                if (sortConfig.key === 'hltv_3_0_score') {
                    aValue = a.matches > 0 ? a.hltv_3_0_score / a.matches : 0;
                    bValue = b.matches > 0 ? b.hltv_3_0_score / b.matches : 0;
                }
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortablePlayers;
    }, [players, sortConfig]);

    const filteredPlayers = sortedPlayers.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const requestSort = (key: keyof AggregatedPlayerStats) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const toggleExpand = (steamId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedPlayerId(expandedPlayerId === steamId ? null : steamId);
    };

    const leagueAverages = useMemo(() => {
        if (players.length === 0) return { rating: 0, adr: 0, kd: 0 };
        const totalRating = players.reduce((acc, p) => acc + (p.matches ? p.hltv_3_0_score / p.matches : 0), 0);
        const totalADR = players.reduce((acc, p) => acc + (p.rounds_played ? p.damage_total / p.rounds_played : 0), 0);
        const totalKD = players.reduce((acc, p) => acc + (p.deaths ? p.kills / p.deaths : p.kills), 0);
        return {
            rating: (totalRating / players.length).toFixed(2),
            adr: (totalADR / players.length).toFixed(1),
            kd: (totalKD / players.length).toFixed(2)
        };
    }, [players]);

    const headers: { key: keyof AggregatedPlayerStats, label: string }[] = [
      { key: 'hltv_3_0_score', label: 'Rating' },
      { key: 'adr', label: 'ADR' },
      { key: 'matches', label: 'Maps' },
    ];

    const getRankIcon = (index: number) => {
        if (index === 0) return <Medal size={24} className="text-yellow-400 drop-shadow-lg" />;
        if (index === 1) return <Medal size={24} className="text-gray-300 drop-shadow-lg" />;
        if (index === 2) return <Medal size={24} className="text-amber-700 drop-shadow-lg" />;
        return <span className="font-mono text-gray-500 font-bold text-lg w-6 text-center">{index + 1}</span>;
    };

    const renderBar = (val: number, max: number, color: string, label?: string) => (
         <div className="flex flex-col w-24">
             {label && <span className="text-[10px] text-app-textMuted uppercase mb-0.5">{label}</span>}
            <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden flex items-center">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, (val / max) * 100)}%` }}></div>
            </div>
            <div className="text-xs font-mono mt-0.5 text-gray-300">{val.toFixed(2)}</div>
         </div>
    );

    return (
        <div className="flex flex-col h-full max-w-7xl mx-auto p-4 pb-20 md:pb-4">
            <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                    { label: "Avg Rating", value: leagueAverages.rating, icon: <Trophy size={16} className="text-yellow-500"/>, color: "from-yellow-500/10 to-transparent" },
                    { label: "Avg ADR", value: leagueAverages.adr, icon: <Target size={16} className="text-red-500"/>, color: "from-red-500/10 to-transparent" },
                    { label: "Avg K/D", value: leagueAverages.kd, icon: <Crosshair size={16} className="text-blue-500"/>, color: "from-blue-500/10 to-transparent" }
                ].map((stat, i) => (
                    <Card key={i} className={`flex flex-col items-center justify-center py-3 bg-gradient-to-b ${stat.color} border-gray-700/50`}>
                        <div className="flex items-center gap-2 mb-1 opacity-80">{stat.icon} <span className="text-xs text-app-textMuted uppercase tracking-wider">{stat.label}</span></div>
                        <span className="text-2xl font-bold text-white font-mono tracking-tight">{stat.value}</span>
                    </Card>
                ))}
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 sticky top-0 z-20 bg-app-bg py-2">
                <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                     <span className="text-sm font-bold text-app-textMuted uppercase mr-2">Sort By:</span>
                     {headers.map(h => (
                         <button key={h.key} onClick={() => requestSort(h.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border ${sortConfig?.key === h.key ? 'bg-app-accent text-white border-app-accent' : 'bg-app-card text-gray-400 border-gray-700 hover:text-white'}`}>
                            {h.label} {sortConfig?.key === h.key && (sortConfig.direction === 'desc' ? <ChevronDown size={12}/> : <ChevronUp size={12}/>)}
                         </button>
                     ))}
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input type="text" placeholder="Search player..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-app-card border border-gray-700 rounded-full pl-9 pr-4 py-2 w-full focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent text-sm transition-all shadow-sm"/>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar space-y-2 pb-4">
                {filteredPlayers.map((player, index) => {
                    const kpr = player.rounds_played ? (player.kills / player.rounds_played) : 0;
                    const adr = player.rounds_played ? (player.damage_total / player.rounds_played) : 0;
                    const rating = player.matches ? (player.hltv_3_0_score / player.matches) : 0;
                    const kd = player.deaths > 0 ? player.kills / player.deaths : player.kills;
                    const role = getWeaponRole(player);
                    const isExpanded = expandedPlayerId === player.steam_id;
                    const isTop3 = index < 3;

                    return (
                        <div key={player.steam_id} 
                            className={`bg-app-card border rounded-xl transition-all duration-300 overflow-hidden group
                                ${isTop3 && index === 0 ? 'border-yellow-500/50 shadow-[0_0_15px_-5px_rgba(234,179,8,0.2)]' : 
                                  isTop3 && index === 1 ? 'border-gray-400/50' : 
                                  isTop3 && index === 2 ? 'border-amber-700/50' : 'border-gray-800 hover:border-gray-600'}
                            `}>
                            <div className="p-3 md:p-4 flex items-center gap-3 md:gap-6 cursor-pointer" onClick={(e) => toggleExpand(player.steam_id, e)}>
                                <div className="flex-none w-8 flex justify-center items-center">{getRankIcon(index)}</div>
                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`font-bold text-base md:text-lg truncate group-hover:text-app-accent transition-colors ${isTop3 ? 'text-white' : 'text-gray-200'}`}>{player.name}</span>
                                        {role === 'Sniper' ? <Tooltip text="Sniper Main"><Crosshair size={14} className="text-app-accent"/></Tooltip> : <Tooltip text="Rifler Main"><Target size={14} className="text-gray-500"/></Tooltip>}
                                    </div>
                                    <div className="text-xs text-app-textMuted flex items-center gap-2">
                                        <span className="bg-gray-800 px-1.5 rounded text-gray-400">{player.matches} Maps</span>
                                        <span className="hidden md:inline font-mono">K/D: {kd.toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className="hidden md:flex items-center gap-6">
                                     {renderBar(adr, 130, 'bg-emerald-500', 'ADR')}
                                     {renderBar(rating, 2.0, rating >= 1.2 ? 'bg-yellow-400' : 'bg-app-accent', 'Rating')}
                                </div>
                                <div className="md:hidden flex flex-col items-end">
                                    <span className={`text-lg font-bold font-mono ${rating >= 1.2 ? 'text-yellow-400' : 'text-app-accent'}`}>{rating.toFixed(2)}</span>
                                    <span className="text-xs text-gray-500 font-mono">Rt.</span>
                                </div>
                                <div className={`transform transition-transform duration-300 text-gray-500 ${isExpanded ? 'rotate-90' : ''}`}><ChevronRight size={20} /></div>
                            </div>
                            <div className={`bg-gray-900/50 border-t border-gray-800/50 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 text-sm transition-all duration-300 origin-top ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 py-0 overflow-hidden'}`}>
                                <div className="space-y-1"><span className="text-xs text-app-textMuted uppercase block">Per Round</span><div className="flex justify-between border-b border-gray-800 border-dashed pb-1"><span>KPR</span> <span className="text-white font-mono">{(kpr).toFixed(2)}</span></div><div className="flex justify-between border-b border-gray-800 border-dashed pb-1"><span>DPR</span> <span className="text-gray-400 font-mono">{(player.deaths / player.rounds_played || 0).toFixed(2)}</span></div></div>
                                <div className="space-y-1"><span className="text-xs text-app-textMuted uppercase block">Opening</span><div className="flex justify-between border-b border-gray-800 border-dashed pb-1"><span>Attempts</span> <span className="text-white font-mono">{player.opening_attempts}</span></div><div className="flex justify-between border-b border-gray-800 border-dashed pb-1"><span>Success</span> <span className="text-green-400 font-mono">{player.opening_attempts > 0 ? Math.round((player.opening_kills / player.opening_attempts)*100) : 0}%</span></div></div>
                                <div className="space-y-1"><span className="text-xs text-app-textMuted uppercase block">Utility & Clutch</span><div className="flex justify-between border-b border-gray-800 border-dashed pb-1"><span>Util Dmg</span> <span className="text-white font-mono">{Math.round(player.utility_damage)}</span></div><div className="flex justify-between border-b border-gray-800 border-dashed pb-1"><span>Clutches</span> <span className="text-yellow-400 font-mono">{player.clutches_won}</span></div></div>
                                <div className="flex items-end justify-end"><button onClick={(e) => { e.stopPropagation(); onPlayerClick(player.steam_id); }} className="w-full bg-app-card hover:bg-app-accent hover:text-white text-app-accent border border-app-accent/30 py-2 rounded-lg transition-all flex items-center justify-center gap-2 group/btn"><Users2 size={16} /> View Full Profile</button></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const ActivityChart = ({ matches }: { matches: Match[] }) => {
    const days = useMemo(() => {
        const result = [];
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString();
            const count = matches.filter(m => new Date(m.timestamp).toLocaleDateString() === dateStr).length;
            result.push({ date: dateStr, count });
        }
        return result;
    }, [matches]);
    const maxCount = Math.max(...days.map(d => d.count), 1);
    return (
        <Card className="p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center"><Activity className="mr-2 text-app-accent" size={20}/> Match Activity (Last 30 Days)</h3>
            <div className="flex items-end justify-between h-32 gap-1">
                {days.map((day, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center group relative">
                         <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-xs px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none border border-gray-700">{day.date}: {day.count} matches</div>
                        <div className={`w-full rounded-t-sm transition-all duration-300 ${day.count > 0 ? 'bg-app-accent hover:bg-app-accentHover' : 'bg-gray-800'}`} style={{ height: `${Math.max((day.count / maxCount) * 100, 4)}%` }}></div>
                    </div>
                ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-app-textMuted"><span>30 days ago</span><span>Today</span></div>
        </Card>
    );
};

const Dashboard = () => {
  const { matches, allPlayers } = useStats();
  const [activeModal, setActiveModal] = useState<null | { type: 'match'; match: Match }>(null);
  const totalMatches = matches.length;
  const totalRounds = useMemo(() => matches.reduce((sum, m) => sum + (m.data[0]?.rounds_played || 0), 0), [matches]);
  const totalKills = useMemo(() => allPlayers.reduce((sum, p) => sum + p.kills, 0), [allPlayers]);
  const topPlayer = useMemo(() => {
    if (allPlayers.length === 0) return null;
    return [...allPlayers].sort((a, b) => (b.hltv_3_0_score / b.matches) - (a.hltv_3_0_score / a.matches))[0];
  }, [allPlayers]);
  const recentMatches = useMemo(() => [...matches].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5), [matches]);
  const leagueStats = useMemo(() => {
    if (allPlayers.length === 0) return { rating: '0.00', kpr: '0.00', dpr: '0.00' };
    const avgRating = allPlayers.reduce((sum, p) => sum + (p.hltv_3_0_score / p.matches || 0), 0) / allPlayers.length;
    const avgKpr = allPlayers.reduce((sum, p) => sum + (p.rounds_played ? p.kills / p.rounds_played : 0), 0) / allPlayers.length;
    return { rating: avgRating.toFixed(2), kpr: avgKpr.toFixed(2) };
  }, [allPlayers]);
  const StatCard = ({ icon, label, value, subtext }: { icon: React.ReactNode, label: string, value: string | number, subtext?: string }) => (
    <Card className="flex flex-col justify-between h-full bg-gradient-to-br from-app-card to-gray-800/30 border-l-4 border-l-app-accent">
      <div className="flex justify-between items-start mb-4"><div className="text-app-accent bg-app-accent/10 p-3 rounded-lg">{icon}</div>{subtext && <span className="text-xs font-mono text-app-success bg-app-success/10 px-2 py-1 rounded">{subtext}</span>}</div>
      <div><p className="text-app-textMuted text-xs uppercase tracking-wide font-bold mb-1">{label}</p><p className="text-3xl font-bold text-white font-mono tracking-tight">{value}</p></div>
    </Card>
  );

  return (
    <div className="p-4 pb-24 md:pb-4 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h1 className="text-3xl font-bold text-white flex items-center"><LayoutDashboard className="mr-3 text-app-accent" /> Dashboard</h1>
            <div className="flex gap-4 text-sm text-app-textMuted bg-app-card px-4 py-2 rounded-lg border border-gray-700">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-app-accent"></span><span>Avg Rating: <span className="text-white font-mono">{leagueStats.rating}</span></span></div>
                <div className="w-px h-4 bg-gray-700"></div>
                <div className="flex items-center gap-2"><span>Avg KPR: <span className="text-white font-mono">{leagueStats.kpr}</span></span></div>
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Gamepad2 size={24} />} label="Total Matches" value={totalMatches} />
            <StatCard icon={<Activity size={24} />} label="Total Rounds" value={totalRounds} />
            <StatCard icon={<Crosshair size={24} />} label="Total Kills" value={totalKills} />
            <StatCard icon={<Trophy size={24} />} label="Top Player" value={topPlayer ? topPlayer.name : 'N/A'} subtext={topPlayer ? `Rating: ${(topPlayer.hltv_3_0_score / topPlayer.matches).toFixed(2)}` : undefined} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><ActivityChart matches={matches} /></div>
            <div className="lg:col-span-1">
                <Card className="h-full flex flex-col">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center"><Calendar className="mr-2 text-app-accent" size={20}/> Recent Matches</h3>
                    <div className="flex-grow overflow-y-auto custom-scrollbar">
                        {recentMatches.length > 0 ? (
                            <ul className="space-y-2">{recentMatches.map(m => (
                                <li key={m.id} className="flex justify-between items-center p-3 bg-gray-900/50 rounded-lg hover:bg-gray-800 transition-colors group cursor-pointer" onClick={() => setActiveModal({ type: 'match', match: m })}>
                                    <div className="overflow-hidden"><p className="font-medium text-sm truncate text-gray-200 group-hover:text-app-accent transition-colors">{m.filename}</p><p className="text-xs text-app-textMuted">{new Date(m.timestamp).toLocaleDateString()}</p></div>
                                    <div className="p-1 bg-gray-800 rounded group-hover:bg-gray-700 text-gray-400 group-hover:text-white"><ExternalLink size={14} /></div>
                                </li>))}</ul>
                        ) : (<p className="text-center text-app-textMuted py-8">No matches played yet.</p>)}
                    </div>
                </Card>
            </div>
        </div>
        <Modal isOpen={activeModal !== null} onClose={() => setActiveModal(null)} title="Match Details">{activeModal && <MatchViewer match={activeModal.match} onBack={() => setActiveModal(null)} />}</Modal>
    </div>
  );
};

const ProgressBar = ({ value, color = "bg-app-accent" }: { value: number, color?: string }) => (
    <div className="w-full bg-gray-700/50 rounded-full h-1.5 mt-3 overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }}></div>
    </div>
);

const StatBox = ({ label, value, icon, max = 100 }: { label: string, value: number, icon?: React.ReactNode, max?: number }) => (
    <div className="bg-app-card border border-gray-700/50 rounded-lg p-4 hover:border-app-accent/30 transition-colors shadow-sm">
        <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2 font-medium text-gray-300">{icon && <span className="text-app-accent opacity-80">{icon}</span>}{label}</div>
            <div className="text-xl font-bold text-white font-mono">{value}<span className="text-xs text-gray-500 ml-0.5 font-normal">/100</span></div>
        </div>
        <ProgressBar value={value} />
    </div>
);

const DetailRow = ({ label, value, highlight = false }: { label: string, value: string | number, highlight?: boolean }) => (
    <div className={`flex justify-between items-center py-3 border-b border-gray-800/50 last:border-0 px-2 ${highlight ? 'bg-app-accent/5 rounded-lg border-none my-1' : ''}`}>
        <span className="text-app-textMuted text-sm font-medium">{label}</span>
        <span className={`font-mono font-bold ${highlight ? 'text-app-accent' : 'text-gray-200'}`}>{value}</span>
    </div>
);

const PlayerProfile = ({ steamId, onBack }: { steamId: string; onBack: () => void; }) => {
    const { matches } = useStats();
    const playerAggregatedStats = useMemo(() => {
        const playerMatches = matches.filter(m => m.data.some(p => p.steam_id.toString() === steamId));
        const aggregated = aggregatePlayerStats(playerMatches);
        return aggregated.find(p => p.steam_id === steamId);
    }, [matches, steamId]);

    const playerMatchHistory = useMemo(() => {
        return matches
            .map(m => ({ match: m, playerData: m.data.find(p => p.steam_id.toString() === steamId) }))
            .filter(item => item.playerData)
            .sort((a, b) => b.match.timestamp - a.match.timestamp);
    }, [matches, steamId]);

    if (!playerAggregatedStats) return <div className="text-center p-8 text-app-textMuted">Player stats not available.</div>;
    const { name, kills, deaths, assists, rounds_played, damage_total, matches: matchCount, hltv_3_0_score, sniper_kills, utility_damage, flashes_thrown, opening_kills, opening_attempts, trade_kills, clutches_won } = playerAggregatedStats;

    const rating = matchCount > 0 ? (hltv_3_0_score / matchCount).toFixed(2) : '0.00';
    const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
    const adr = rounds_played > 0 ? (damage_total / rounds_played).toFixed(1) : '0.0';
    const kpr = rounds_played > 0 ? (kills / rounds_played).toFixed(2) : '0.00';
    const apr = rounds_played > 0 ? (assists / rounds_played).toFixed(2) : '0.00';
    const dpr = rounds_played > 0 ? (deaths / rounds_played).toFixed(2) : '0.00';
    const impactRating = (parseFloat(rating) * 0.95).toFixed(2);
    const calcScore = (val: number, target: number) => Math.min(100, Math.round((val / target) * 100));
    const firepowerScore = calcScore(parseFloat(adr), 100);
    const entryScore = opening_attempts > 0 ? calcScore((opening_kills / opening_attempts), 0.6) : 0;
    const openingScore = calcScore((opening_kills / matchCount), 3.5);
    const tradingScore = calcScore((trade_kills / matchCount), 3.0);
    const clutchingScore = calcScore((clutches_won / matchCount), 1.0);
    const snipingScore = calcScore((sniper_kills / kills), 0.5);
    const utilityScore = calcScore((utility_damage / matchCount), 300);
    const utilDmgPerRound = rounds_played > 0 ? (utility_damage / rounds_played).toFixed(1) : '0.0';

    return (
        <div className="text-app-text font-sans h-full max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4 pb-6 border-b border-gray-800">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"><ArrowLeft size={20} /></button>
                    <div><h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight flex items-center gap-3"><SteamProfileLink steamId={steamId.toString()} className="hover:text-app-accent transition-colors">{name}</SteamProfileLink></h2><div className="text-app-textMuted text-sm font-mono flex items-center gap-2"><span className="bg-gray-800 px-2 py-0.5 rounded text-xs">ID: {steamId}</span></div></div>
                </div>
                <div className="flex gap-2"><div className="bg-app-accent/10 border border-app-accent/20 px-4 py-2 rounded-lg text-center min-w-[100px]"><div className="text-xs text-app-textMuted uppercase tracking-wider font-bold">Maps</div><div className="text-xl font-bold text-app-accent font-mono">{matchCount}</div></div><div className="bg-gray-800 border border-gray-700 px-4 py-2 rounded-lg text-center min-w-[100px]"><div className="text-xs text-app-textMuted uppercase tracking-wider font-bold">Rounds</div><div className="text-xl font-bold text-white font-mono">{rounds_played}</div></div></div>
            </div>
            <div className="mb-8"><h3 className="text-lg font-bold text-white mb-4 flex items-center"><Target className="mr-2 text-app-accent" size={20}/> Playstyle Analysis</h3><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><StatBox label="Firepower" value={firepowerScore} icon={<Flame size={18}/>} /><StatBox label="Entrying" value={entryScore} icon={<Footprints size={18}/>} /><StatBox label="Opening" value={openingScore} icon={<Zap size={18}/>} /><StatBox label="Trading" value={tradingScore} icon={<Users size={18}/>} /><StatBox label="Clutching" value={clutchingScore} icon={<Skull size={18}/>} /><StatBox label="Sniping" value={snipingScore} icon={<Crosshair size={18}/>} /><StatBox label="Utility" value={utilityScore} icon={<Bomb size={18}/>} /></div></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <Card className="bg-gradient-to-br from-app-card to-gray-900 border-gray-700/50"><div className="px-2 py-3 border-b border-gray-800 mb-2 font-bold text-app-accent uppercase text-xs tracking-wider flex items-center"><Activity size={16} className="mr-2" /> Combat Statistics</div><div className="px-2 space-y-0.5"><DetailRow label="Total kills" value={kills} /><DetailRow label="Total deaths" value={deaths} /><DetailRow label="K/D Ratio" value={kd} highlight /><DetailRow label="Damage / Round" value={adr} highlight/><DetailRow label="Grenade dmg / Round" value={utilDmgPerRound} /></div></Card>
                <Card className="bg-gradient-to-br from-app-card to-gray-900 border-gray-700/50"><div className="px-2 py-3 border-b border-gray-800 mb-2 font-bold text-app-accent uppercase text-xs tracking-wider flex items-center"><BarChart2 size={16} className="mr-2" /> Round Performance</div><div className="px-2 space-y-0.5"><DetailRow label="Kills / round" value={kpr} /><DetailRow label="Assists / round" value={apr} /><DetailRow label="Deaths / round" value={dpr} /><DetailRow label="Impact rating" value={impactRating} highlight /><DetailRow label="HLTV Rating" value={rating} highlight /></div></Card>
            </div>
             <Card><h3 className="text-xl font-bold text-white mb-4 flex items-center"><Calendar className="mr-2 text-app-accent" size={20}/> Match History</h3><div className="max-h-80 overflow-y-auto custom-scrollbar"><table className="w-full text-left"><thead className="sticky top-0 bg-gray-900 z-10 text-xs text-app-textMuted uppercase tracking-wider"><tr><th className="p-3">Date</th><th className="p-3">Match</th><th className="p-3 text-center">K - D</th><th className="p-3 text-center">Rating</th></tr></thead><tbody className="divide-y divide-gray-800">{playerMatchHistory.map(({ match, playerData }) => (<tr key={match.id} className="hover:bg-gray-800/50 transition-colors"><td className="p-3 text-app-textMuted text-sm whitespace-nowrap">{new Date(match.timestamp).toLocaleDateString()}</td><td className="p-3 text-sm truncate max-w-[150px] md:max-w-xs text-white">{match.filename}</td><td className="p-3 text-center font-mono text-sm"><span className="text-green-400">{playerData!.kills}</span> - <span className="text-red-400">{playerData!.deaths}</span></td><td className="p-3 text-center"><span className={`font-mono font-bold px-2 py-1 rounded text-sm ${playerData!.hltv_3_0_score >= 1.2 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-white'}`}>{playerData!.hltv_3_0_score.toFixed(2)}</span></td></tr>))}</tbody></table></div></Card>
        </div>
    );
};

const MatchViewer = ({ match, onBack }: { match: Match; onBack: () => void; }) => {
    const [view, setView] = useState<'scoreboard' | 'duels'>('scoreboard');
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerStats | null>(match.data[0] || null);
    const sortedScoreboard = [...match.data].sort((a, b) => b.kills - a.kills);

    return (
        <div className="h-full flex flex-col">
            <div className="flex-none pb-4 border-b border-gray-700 mb-4">
                <div className="flex items-center gap-3 mb-4"><button onClick={onBack} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"><ArrowLeft size={18} /></button><div><h2 className="text-xl md:text-2xl font-bold text-white truncate max-w-md">{match.filename}</h2><p className="text-sm text-app-textMuted">{new Date(match.timestamp).toLocaleString()}</p></div></div>
                 <div className="flex space-x-1 bg-gray-800/50 p-1 rounded-lg w-max"><button onClick={() => setView('scoreboard')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'scoreboard' ? 'bg-app-accent text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>Scoreboard</button><button onClick={() => setView('duels')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'duels' ? 'bg-app-accent text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>Duels</button></div>
            </div>
            <div className="flex-grow overflow-auto custom-scrollbar">
                {view === 'scoreboard' && (<div className="overflow-x-auto bg-app-card rounded-lg border border-gray-700/50"><table className="w-full text-left min-w-[600px] md:min-w-0"><thead className="bg-gray-800/50 text-xs text-app-textMuted uppercase tracking-wider"><tr><th className="p-4">Player</th><th className="p-4 text-center">K</th><th className="p-4 text-center">D</th><th className="p-4 text-center">A</th><th className="p-4 text-center">ADR</th><th className="p-4 text-center">Rating</th></tr></thead><tbody className="divide-y divide-gray-800">{sortedScoreboard.map(p => (<tr key={p.steam_id.toString()} className="hover:bg-gray-800/50 transition-colors"><td className="p-4 font-medium"><SteamProfileLink steamId={p.steam_id.toString()} className="text-white hover:text-app-accent">{p.name}</SteamProfileLink></td><td className="p-4 text-center font-mono text-gray-300">{p.kills}</td><td className="p-4 text-center font-mono text-gray-400">{p.deaths}</td><td className="p-4 text-center font-mono text-gray-400">{p.assists}</td><td className="p-4 text-center font-mono text-gray-300">{(p.damage_total / p.rounds_played).toFixed(1)}</td><td className="p-4 text-center font-bold font-mono text-app-accent">{p.hltv_3_0_score.toFixed(2)}</td></tr>))}</tbody></table></div>)}
                {view === 'duels' && selectedPlayer && (
                     <div className="flex flex-col md:flex-row gap-6 h-full"><div className="w-full md:w-1/3 flex flex-col max-h-60 md:max-h-full"><h3 className="text-sm font-bold text-app-textMuted uppercase mb-3 px-1">Select Player</h3><div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar bg-app-card border border-gray-700 rounded-xl p-2 h-full">{sortedScoreboard.map(p => (<button key={p.steam_id.toString()} onClick={() => setSelectedPlayer(p)} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between items-center ${selectedPlayer.steam_id === p.steam_id ? 'bg-app-accent text-white font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}><span className="truncate">{p.name}</span>{selectedPlayer.steam_id === p.steam_id && <CheckSquare size={14}/>}</button>))}</div></div>
                        <div className="w-full md:w-2/3 flex flex-col h-full overflow-hidden"><div className="flex items-center gap-2 mb-3 px-1"><h3 className="text-sm font-bold text-app-textMuted uppercase">Duels Analysis</h3><div className="h-px bg-gray-800 flex-grow"></div><span className="text-xs text-app-accent bg-app-accent/10 px-2 py-0.5 rounded border border-app-accent/20">{getWeaponRole(selectedPlayer) === 'Sniper' ? 'Sniper Role' : 'Rifler Role'}</span></div><div className="overflow-y-auto custom-scrollbar flex-grow bg-app-card border border-gray-700 rounded-xl"><table className="w-full text-left"><thead className="bg-gray-800/80 sticky top-0 z-10 text-xs text-app-textMuted uppercase tracking-wider backdrop-blur-md"><tr><th className="p-3">Opponent</th><th className="p-3 text-center">Kills</th><th className="p-3 text-center">Deaths</th><th className="p-3 text-center">Diff</th></tr></thead><tbody className="divide-y divide-gray-800">{(Object.entries(selectedPlayer.duels) as [string, DuelData][]).sort(([, a], [, b]) => b.diff - a.diff).map(([opponentId, duelData]) => {const opponent = match.data.find(p => p.steam_id.toString() === opponentId);const opponentRoleIcon = opponent ? (getWeaponRole(opponent) === 'Sniper' ? <Tooltip text="Sniper"><Crosshair className="inline-block text-sky-400 ml-2" size={14}/></Tooltip> : <Tooltip text="Rifler"><Target className="inline-block text-app-accent ml-2" size={14}/></Tooltip>) : null;return (<tr key={opponentId} className="hover:bg-gray-800/50 transition-colors"><td className="p-3 flex items-center text-sm font-medium text-white">{duelData.opponent_name} {opponentRoleIcon}</td><td className="p-3 text-center text-green-400 font-mono font-bold">{duelData.kills}</td><td className="p-3 text-center text-red-400 font-mono font-bold">{duelData.deaths}</td><td className={`p-3 text-center font-bold font-mono ${duelData.diff > 0 ? 'text-green-500' : duelData.diff < 0 ? 'text-red-500' : 'text-gray-500'}`}>{duelData.diff > 0 ? `+${duelData.diff}` : duelData.diff}</td></tr>);})}</tbody></table></div></div></div>)}
            </div>
        </div>
    );
};

const TeamBuilder = () => {
    const { allPlayers } = useStats();
    const [lobbyPlayers, setLobbyPlayers] = useState<string[]>([]);
    const [manualAssignments, setManualAssignments] = useState<Record<string, 'team1' | 'team2' | 'bench'>>({});
    const [generatedTeams, setGeneratedTeams] = useState<{ team1: AggregatedPlayerStats[], team2: AggregatedPlayerStats[] } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const addPlayerToLobby = (steamId: string) => { if (!lobbyPlayers.includes(steamId) && lobbyPlayers.length < 10) setLobbyPlayers([...lobbyPlayers, steamId]); };
    const removePlayerFromLobby = (steamId: string) => { setLobbyPlayers(lobbyPlayers.filter(id => id !== steamId)); const newAssignments = { ...manualAssignments }; delete newAssignments[steamId]; setManualAssignments(newAssignments); };
    const assignPlayer = (steamId: string, team: 'team1' | 'team2' | 'bench' | null) => { const newAssignments = { ...manualAssignments }; if (team === null) delete newAssignments[steamId]; else newAssignments[steamId] = team; setManualAssignments(newAssignments); };

    const generateTeams = () => {
        const activePlayers = lobbyPlayers.filter(id => manualAssignments[id] !== 'bench').map(id => allPlayers.find(p => p.steam_id === id)).filter((p): p is AggregatedPlayerStats => p !== undefined);
        if (activePlayers.length % 2 !== 0 || activePlayers.length < 2) { alert("Please select an even number of active (not benched) players."); return; }
        const teamSize = activePlayers.length / 2;
        let team1 = activePlayers.filter(p => manualAssignments[p.steam_id] === 'team1');
        let team2 = activePlayers.filter(p => manualAssignments[p.steam_id] === 'team2');
        const pool = activePlayers.filter(p => !manualAssignments[p.steam_id]).sort((a, b) => (b.hltv_3_0_score / b.matches) - (a.hltv_3_0_score / a.matches));
        pool.forEach(player => {
            const team1Rating = team1.reduce((sum, p) => sum + (p.hltv_3_0_score / p.matches), 0);
            const team2Rating = team2.reduce((sum, p) => sum + (p.hltv_3_0_score / p.matches), 0);
            if (team1.length < teamSize && (team1Rating <= team2Rating || team2.length >= teamSize)) team1.push(player); else if (team2.length < teamSize) team2.push(player);
        });
        setGeneratedTeams({ team1, team2 });
    };

    const lobbyPlayerDetails = useMemo(() => lobbyPlayers.map(id => allPlayers.find(p => p.steam_id === id)).filter((p): p is AggregatedPlayerStats => p !== undefined), [lobbyPlayers, allPlayers]);
    const filteredAllPlayers = allPlayers.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    const TeamDisplay = ({ team, name, colorClass }: { team: AggregatedPlayerStats[], name: string, colorClass: string }) => {
        const totalRating = team.reduce((sum, p) => sum + (p.hltv_3_0_score / p.matches), 0);
        const avgRating = team.length > 0 ? (totalRating / team.length).toFixed(2) : '0.00';
        return (<div className="bg-app-card border border-gray-700 rounded-xl p-4 flex flex-col h-full"><div className={`text-lg font-bold mb-1 ${colorClass}`}>{name}</div><div className="text-xs text-app-textMuted mb-4 font-mono">AVG RATING: {avgRating}</div><div className="space-y-2 flex-grow">{team.map(p => (<div key={p.steam_id} className="flex justify-between items-center bg-gray-800/50 p-3 rounded-lg border border-gray-700/30"><span className="font-medium text-white truncate mr-2">{p.name}</span><span className="font-mono text-sm font-bold text-gray-400">{(p.hltv_3_0_score / p.matches).toFixed(2)}</span></div>))}</div></div>);
    };

    return (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden max-w-7xl mx-auto pb-24 md:pb-4">
            <div className="flex flex-col h-full lg:h-auto lg:max-h-full"><h2 className="text-xl font-bold text-white mb-4 flex items-center"><Users className="mr-2 text-app-accent" /> Player Pool</h2><div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} /><input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-app-card border border-gray-700 rounded-lg pl-10 pr-4 py-2 w-full focus:outline-none focus:border-app-accent text-sm"/></div><div className="flex-grow overflow-y-auto custom-scrollbar bg-app-card border border-gray-700 rounded-xl"><ul className="divide-y divide-gray-800">{filteredAllPlayers.map(p => { const isInLobby = lobbyPlayers.includes(p.steam_id); return (<li key={p.steam_id} className={`flex justify-between items-center p-3 ${isInLobby ? 'opacity-50 bg-gray-900/50' : 'cursor-pointer hover:bg-gray-800 transition-colors'}`} onClick={() => !isInLobby && addPlayerToLobby(p.steam_id)}><div className="truncate mr-2"><p className="font-medium truncate text-sm text-white">{p.name}</p><p className="text-xs text-app-textMuted font-mono">{(p.hltv_3_0_score / p.matches).toFixed(2)}</p></div>{isInLobby ? <CheckSquare size={16} className="text-app-accent"/> : <Square size={16} className="text-gray-600"/>}</li>); })}</ul></div></div>
            <div className="flex flex-col h-full lg:h-auto lg:max-h-full"><div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold text-white flex items-center"><Users2 className="mr-2 text-app-accent" /> Lobby ({lobbyPlayers.length})</h2>{lobbyPlayers.length > 0 && (<button onClick={() => { setLobbyPlayers([]); setManualAssignments({}); setGeneratedTeams(null); }} className="text-xs text-red-400 hover:text-red-300">Clear All</button>)}</div><div className="flex-grow overflow-y-auto custom-scrollbar bg-app-card border border-gray-700 rounded-xl mb-4 p-2 space-y-2">{lobbyPlayerDetails.length > 0 ? (lobbyPlayerDetails.map(p => (<div key={p.steam_id} className={`bg-gray-800/40 border border-gray-700/50 rounded-lg p-2 transition-all ${manualAssignments[p.steam_id] === 'bench' ? 'opacity-50 grayscale' : ''}`}><div className="flex justify-between items-center mb-2"><span className="font-medium text-sm text-white truncate">{p.name}</span><button onClick={() => removePlayerFromLobby(p.steam_id)} className="text-gray-500 hover:text-red-400 transition-colors"><X size={14}/></button></div><div className="grid grid-cols-4 gap-1"><button onClick={() => assignPlayer(p.steam_id, 'team1')} className={`text-xs py-1 rounded transition-colors ${manualAssignments[p.steam_id] === 'team1' ? 'bg-app-accent text-white font-bold shadow-sm' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>A</button><button onClick={() => assignPlayer(p.steam_id, null)} className={`py-1 rounded flex justify-center items-center transition-colors ${!manualAssignments[p.steam_id] ? 'bg-gray-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}><Shuffle size={12}/></button><button onClick={() => assignPlayer(p.steam_id, 'team2')} className={`text-xs py-1 rounded transition-colors ${manualAssignments[p.steam_id] === 'team2' ? 'bg-purple-500 text-white font-bold shadow-sm' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>B</button><button onClick={() => assignPlayer(p.steam_id, 'bench')} className={`py-1 rounded flex justify-center items-center transition-colors ${manualAssignments[p.steam_id] === 'bench' ? 'bg-red-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}><Ban size={12}/></button></div></div>))) : (<div className="h-full flex items-center justify-center text-app-textMuted text-sm italic">Add players to lobby</div>)}</div><button onClick={generateTeams} disabled={lobbyPlayers.length < 2} className="w-full bg-app-accent text-white font-bold py-3 rounded-lg flex items-center justify-center hover:bg-app-accentHover disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed shadow-lg transition-all active:scale-[0.98]"><Shuffle className="mr-2" size={18} /> Generate Teams</button></div>
            <div className="flex flex-col h-full lg:h-auto lg:max-h-full"><h2 className="text-xl font-bold text-white mb-4 flex items-center"><Shield className="mr-2 text-app-accent" /> Matchup</h2>{generatedTeams ? (<div className="flex flex-col gap-4 flex-grow overflow-y-auto custom-scrollbar"><TeamDisplay team={generatedTeams.team1} name="Team Alpha" colorClass="text-app-accent" /><div className="flex items-center justify-center"><span className="bg-gray-800 text-gray-400 text-xs font-bold px-2 py-1 rounded-full border border-gray-700">VS</span></div><TeamDisplay team={generatedTeams.team2} name="Team Bravo" colorClass="text-purple-400" /></div>) : (<div className="flex-grow flex items-center justify-center bg-app-card border border-gray-700/50 border-dashed rounded-xl"><div className="text-center text-app-textMuted opacity-50"><Shield size={48} className="mx-auto mb-2"/><p>Teams will appear here</p></div></div>)}</div>
        </div>
    );
};

const Duels = () => {
    const { allPlayers, matches } = useStats();
    const [player1Id, setPlayer1Id] = useState<string | null>(null);
    const [player2Id, setPlayer2Id] = useState<string | null>(null);
    const duelStats = useMemo(() => {
        if (!player1Id || !player2Id) return null;
        const p1 = allPlayers.find(p => p.steam_id === player1Id);
        const p2 = allPlayers.find(p => p.steam_id === player2Id);
        if (!p1 || !p2) return null;
        let p1Kills = 0, p2Kills = 0, history: any[] = [];
        matches.forEach(match => {
            const p1Data = match.data.find(p => p.steam_id.toString() === player1Id);
            const p2Data = match.data.find(p => p.steam_id.toString() === player2Id);
            if (p1Data && p2Data) {
                const p1Duel = p1Data.duels[player2Id];
                const p2Duel = p2Data.duels[player1Id];
                const commonData = { match, p1Role: getWeaponRole(p1Data), p2Role: getWeaponRole(p2Data), p1Team: p1Data.last_team_name, p2Team: p2Data.last_team_name };
                if (p1Duel) { p1Kills += p1Duel.kills; p2Kills += p1Duel.deaths; history.push({ ...commonData, p1Kills: p1Duel.kills, p2Kills: p1Duel.deaths }); } 
                else if (p2Duel) { p1Kills += p2Duel.deaths; p2Kills += p2Duel.kills; history.push({ ...commonData, p1Kills: p2Duel.deaths, p2Kills: p2Duel.kills }); }
            }
        });
        history.sort((a,b) => b.match.timestamp - a.match.timestamp);
        return { p1, p2, p1Kills, p2Kills, history };
    }, [player1Id, player2Id, allPlayers, matches]);
    const PlayerSelect = ({ selectedId, onChange, otherId, label }: { selectedId: string | null; onChange: (id: string) => void; otherId: string | null; label: string; }) => (<div className="w-full"><label className="text-xs font-bold text-app-textMuted uppercase mb-1 block">{label}</label><select value={selectedId || ''} onChange={(e) => onChange(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 focus:outline-none focus:border-app-accent text-white appearance-none cursor-pointer"><option value="" disabled>Select Player</option>{allPlayers.filter(p => p.steam_id !== otherId).map(p => (<option key={p.steam_id} value={p.steam_id}>{p.name}</option>))}</select></div>);
    const ComparisonBar = ({ value1, value2, color1, color2 }: { value1: number; value2: number; color1: string; color2: string; }) => { const total = value1 + value2; const pct1 = total > 0 ? (value1 / total) * 100 : 50; return (<div className="w-full flex h-3 bg-gray-800 rounded-full overflow-hidden mt-2"><div style={{ width: `${pct1}%` }} className={`${color1} transition-all duration-500`}></div><div style={{ width: `${100 - pct1}%` }} className={`${color2} transition-all duration-500`}></div></div>); };
    const overallStatsConfig: { label: string; statFn: (p: AggregatedPlayerStats) => string }[] = [{ label: 'Rating', statFn: (p) => (p.hltv_3_0_score / p.matches).toFixed(2) }, { label: 'K/D', statFn: (p) => (p.deaths > 0 ? p.kills / p.deaths : p.kills).toFixed(2) }, { label: 'ADR', statFn: (p) => (p.rounds_played > 0 ? p.damage_total / p.rounds_played : 0).toFixed(1) }];

    return (
        <div className="p-4 h-full flex flex-col max-w-7xl mx-auto pb-24 md:pb-4">
            <h1 className="text-3xl font-bold text-white mb-6 flex items-center"><Swords className="mr-3 text-app-accent" /> Face-off</h1>
            <div className="bg-app-card border border-gray-700 rounded-xl p-6 mb-6 shadow-sm"><div className="flex flex-col md:flex-row gap-8 items-center justify-between"><PlayerSelect selectedId={player1Id} onChange={setPlayer1Id} otherId={player2Id} label="Player 1" /><div className="text-3xl font-black text-gray-700 italic">VS</div><PlayerSelect selectedId={player2Id} onChange={setPlayer2Id} otherId={player1Id} label="Player 2" /></div></div>
            {duelStats ? (<div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden"><Card className="flex flex-col h-full overflow-hidden"><h2 className="text-lg font-bold text-white mb-6 border-b border-gray-800 pb-2">Head-to-Head Statistics</h2><div className="flex justify-between items-end mb-1"><span className="font-bold text-app-accent text-2xl truncate">{duelStats.p1.name}</span><span className="font-bold text-purple-400 text-2xl truncate">{duelStats.p2.name}</span></div><div className="mb-8"><div className="flex justify-between text-sm text-app-textMuted mb-1"><span>{duelStats.p1Kills} Kills</span><span className="font-bold text-white">TOTAL KILLS</span><span>{duelStats.p2Kills} Kills</span></div><ComparisonBar value1={duelStats.p1Kills} value2={duelStats.p2Kills} color1="bg-app-accent" color2="bg-purple-500" /></div><div className="space-y-6">{overallStatsConfig.map((s) => (<div key={s.label}><div className="flex justify-between text-sm font-medium text-white mb-1"><span className="font-mono">{s.statFn(duelStats.p1)}</span><span className="text-app-textMuted text-xs uppercase tracking-wider">{s.label}</span><span className="font-mono">{s.statFn(duelStats.p2)}</span></div><ComparisonBar value1={parseFloat(s.statFn(duelStats.p1))} value2={parseFloat(s.statFn(duelStats.p2))} color1="bg-app-accent" color2="bg-purple-500" /></div>))}</div></Card><Card className="flex flex-col h-full overflow-hidden"><h2 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2">Match History</h2><div className="flex-grow overflow-y-auto custom-scrollbar"><table className="w-full text-left"><thead className="sticky top-0 bg-app-card z-10 text-xs text-app-textMuted uppercase"><tr><th className="p-3">Date</th><th className="p-3">Teams</th><th className="p-3 text-center">Score</th><th className="p-3 text-center">Roles</th></tr></thead><tbody className="divide-y divide-gray-800">{duelStats.history.map(({match, p1Kills, p2Kills, p1Role, p2Role, p1Team, p2Team}, index) => (<tr key={index} className="hover:bg-gray-800/50"><td className="p-3 text-xs text-app-textMuted">{new Date(match.timestamp).toLocaleDateString()}</td><td className="p-3 text-[10px] font-medium"><div className="text-app-accent truncate max-w-[100px]">{p1Team}</div><div className="text-purple-400 truncate max-w-[100px]">{p2Team}</div></td><td className="p-3 text-center font-mono font-bold whitespace-nowrap"><span className={p1Kills > p2Kills ? "text-green-400" : "text-gray-400"}>{p1Kills}</span><span className="text-gray-600 mx-1">:</span><span className={p2Kills > p1Kills ? "text-green-400" : "text-gray-400"}>{p2Kills}</span></td><td className="p-3 text-center"><div className="flex items-center justify-center gap-2">{p1Role === 'Sniper' ? <Crosshair className="text-blue-400" size={14}/> : <Target className="text-gray-500" size={14}/>}<span className="text-gray-700 text-xs">vs</span>{p2Role === 'Sniper' ? <Crosshair className="text-blue-400" size={14}/> : <Target className="text-gray-500" size={14}/>}</div></td></tr>))}</tbody></table></div></Card></div>) : (<div className="flex-grow flex items-center justify-center opacity-50"><div className="text-center"><Swords size={64} className="mx-auto mb-4 text-app-textMuted"/><p className="text-xl text-app-textMuted">Select two players to compare</p></div></div>)}
        </div>
    );
};

const DataManager = ({ onBack }: { onBack?: () => void }) => {
    const { matches, addMatch, addMatches, deleteMatch, deleteMatches, restoreData, dbType, setFirebaseConfig } = useStats();
    const { logout } = useAuth();
    const [view, setView] = useState<'files' | 'settings'>('files');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const backupInputRef = useRef<HTMLInputElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedMatches, setSelectedMatches] = useState<string[]>([]);
    const [fbConfig, setFbConfig] = useState({ apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' });

    const filteredMatches = matches.filter(m => m.filename.toLowerCase().includes(searchTerm.toLowerCase())).sort((a,b) => b.timestamp - a.timestamp);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        const newMatches: Match[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) continue;
            if (file.name.endsWith('.json')) {
                const reader = new FileReader();
                reader.onload = (event) => { try { const content = event.target?.result as string; const safeContent = content.replace(/"steam_id":\s*(\d+)/g, '"steam_id": "$1"'); const data = JSON.parse(safeContent); if (Array.isArray(data)) { addMatch({ id: crypto.randomUUID(), filename: file.name, timestamp: parseDateFromFilename(file.name), data: data }); } } catch (err) { alert(`Error parsing ${file.name}`); } };
                reader.readAsText(file);
            } else if (file.name.endsWith('.zip')) {
                const zip = new JSZip();
                try {
                    const content = await zip.loadAsync(file);
                    for (const filename in content.files) {
                        if (filename.endsWith('.json')) {
                            const fileContent = await content.files[filename].async('string');
                            try { const safeContent = fileContent.replace(/"steam_id":\s*(\d+)/g, '"steam_id": "$1"'); const data = JSON.parse(safeContent); if(Array.isArray(data)) { newMatches.push({ id: crypto.randomUUID(), filename: filename, timestamp: parseDateFromFilename(filename), data: data }); } } catch (err) {}
                        }
                    }
                } catch (err) { alert(`Error processing ${file.name}`); }
            }
        }
        if (newMatches.length > 0) addMatches(newMatches);
        if(fileInputRef.current) fileInputRef.current.value = '';
    };
    
    const handleBackup = () => {
        const dataStr = JSON.stringify(matches);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', `cs_stats_backup_${new Date().toISOString().slice(0,10)}.json`);
        linkElement.click();
    };

    const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => { try { const content = event.target?.result as string; const data = JSON.parse(content); if (Array.isArray(data)) { if(confirm("Overwrite all data?")) restoreData(data); } else { alert("Invalid backup"); } } catch (err) { alert("Failed to parse backup"); } };
        reader.readAsText(file);
        if(backupInputRef.current) backupInputRef.current.value = '';
    };

    const handleBulkDelete = () => { if (selectedMatches.length === 0) return; if (confirm(`Delete ${selectedMatches.length} matches?`)) { deleteMatches(selectedMatches); setSelectedMatches([]); } };
    const toggleSelection = (id: string) => setSelectedMatches(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const toggleSelectAll = () => setSelectedMatches(selectedMatches.length === filteredMatches.length ? [] : filteredMatches.map(m => m.id));

    return (
        <div className="p-4 h-full flex flex-col pb-24 md:pb-4 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <h1 className="text-3xl font-bold text-white flex items-center"><Shield className="mr-3 text-app-accent" /> Data Management</h1>
                <div className="flex gap-3">
                    <button onClick={() => setView('files')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'files' ? 'bg-app-accent text-white' : 'text-gray-400 hover:text-white'}`}>Files</button>
                    <button onClick={() => setView('settings')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'settings' ? 'bg-app-accent text-white' : 'text-gray-400 hover:text-white'}`}>Settings</button>
                    <button onClick={() => { logout(); onBack?.(); }} className="flex items-center text-red-400 hover:text-red-300 px-4 py-2 rounded-lg border border-red-900/50 hover:bg-red-900/20 transition-all font-medium"><LogOut size={16} className="mr-2" /> Logout</button>
                    {onBack && <button onClick={onBack} className="flex items-center text-app-accent hover:text-white px-4 py-2 rounded-lg border border-app-accent/20 hover:bg-app-accent/10 transition-all font-medium"><ArrowLeft size={16} className="mr-2" /> Back</button>}
                </div>
            </div>

            {view === 'files' && (
                <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <Card className="bg-gradient-to-br from-app-card to-gray-800 border-gray-700 hover:border-app-accent/50 group"><button onClick={() => fileInputRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center py-6 text-center"><div className="bg-app-accent/10 p-3 rounded-full mb-3 group-hover:bg-app-accent/20 transition-colors"><Upload className="text-app-accent" size={28}/></div><span className="font-bold text-white">Upload Data</span><span className="text-xs text-app-textMuted mt-1">JSON or ZIP files</span></button><input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json,.zip" multiple className="hidden" /></Card>
                    <Card className="bg-gradient-to-br from-app-card to-gray-800 border-gray-700 hover:border-emerald-500/50 group"><button onClick={handleBackup} className="w-full h-full flex flex-col items-center justify-center py-6 text-center"><div className="bg-emerald-500/10 p-3 rounded-full mb-3 group-hover:bg-emerald-500/20 transition-colors"><Save className="text-emerald-400" size={28}/></div><span className="font-bold text-white">Backup Data</span><span className="text-xs text-app-textMuted mt-1">Export JSON</span></button></Card>
                    <Card className="bg-gradient-to-br from-app-card to-gray-800 border-gray-700 hover:border-yellow-500/50 group"><button onClick={() => backupInputRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center py-6 text-center"><div className="bg-yellow-500/10 p-3 rounded-full mb-3 group-hover:bg-yellow-500/20 transition-colors"><RefreshCw className="text-yellow-400" size={28}/></div><span className="font-bold text-white">Restore Data</span><span className="text-xs text-app-textMuted mt-1">Import JSON Backup</span></button><input type="file" ref={backupInputRef} onChange={handleRestore} accept=".json" className="hidden" /></Card>
                </div>
                <Card className="flex-grow flex flex-col overflow-hidden border-gray-700 bg-gray-900/50">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 p-2"><h2 className="text-lg font-bold text-white flex items-center">Match Database <span className="ml-2 px-2 py-0.5 bg-gray-800 rounded-full text-xs text-app-textMuted">{matches.length}</span></h2><div className="flex items-center gap-2 w-full md:w-auto"><div className="relative flex-grow md:flex-grow-0 md:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} /><input type="text" placeholder="Search filename..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 w-full focus:outline-none focus:border-app-accent text-sm"/></div>{selectedMatches.length > 0 && (<button onClick={handleBulkDelete} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-2 rounded-lg flex items-center text-sm font-medium border border-red-500/20 transition-colors"><Trash2 size={16} className="mr-2"/> Delete ({selectedMatches.length})</button>)}</div></div>
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg flex-grow overflow-hidden flex flex-col"><div className="flex items-center p-3 border-b border-gray-700 bg-gray-800/80 text-xs font-bold text-app-textMuted uppercase tracking-wider"><div className="w-10 flex justify-center"><button onClick={toggleSelectAll} className="hover:text-white">{selectedMatches.length > 0 && selectedMatches.length === filteredMatches.length ? <CheckSquare size={16}/> : <Square size={16}/>}</button></div><div className="flex-grow">Filename</div><div className="w-32 text-right">Date</div><div className="w-16 text-center">Actions</div></div><div className="overflow-y-auto flex-grow custom-scrollbar">{filteredMatches.length > 0 ? (<ul className="divide-y divide-gray-700/50">{filteredMatches.map(match => (<li key={match.id} className={`flex items-center p-3 hover:bg-gray-700/30 transition-colors ${selectedMatches.includes(match.id) ? 'bg-app-accent/5' : ''}`}><div className="w-10 flex justify-center"><button onClick={() => toggleSelection(match.id)} className={`text-gray-500 hover:text-white transition-colors ${selectedMatches.includes(match.id) ? 'text-app-accent' : ''}`}>{selectedMatches.includes(match.id) ? <CheckSquare size={16}/> : <Square size={16}/>}</button></div><div className="flex-grow min-w-0 pr-4"><p className="text-sm font-medium text-gray-200 truncate">{match.filename}</p></div><div className="w-32 text-right text-xs text-app-textMuted font-mono">{new Date(match.timestamp).toLocaleDateString()}</div><div className="w-16 flex justify-center"><button onClick={() => deleteMatch(match.id)} className="text-gray-500 hover:text-red-400 p-1.5 rounded hover:bg-gray-700 transition-colors"><Trash2 size={16} /></button></div></li>))}</ul>) : (<div className="h-32 flex items-center justify-center text-app-textMuted text-sm">{searchTerm ? 'No matches found.' : 'No matches uploaded.'}</div>)}</div></div>
                </Card>
                </>
            )}
            
            {view === 'settings' && (
                <Card className="max-w-2xl mx-auto w-full">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center"><Database className="mr-2 text-app-accent"/> Database Settings</h2>
                    <div className="mb-8 p-4 bg-gray-800/50 rounded-xl border border-gray-700 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-full ${dbType === 'local' ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
                                {dbType === 'local' ? <HardDrive className="text-emerald-500"/> : <Cloud className="text-blue-500"/>}
                            </div>
                            <div>
                                <h3 className="font-bold text-white">Current Storage Engine</h3>
                                <p className="text-sm text-app-textMuted">{dbType === 'local' ? 'Local Browser Storage (IndexedDB)' : 'Cloud Storage (Firebase)'}</p>
                            </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${dbType === 'local' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {dbType === 'local' ? 'OFFLINE' : 'ONLINE'}
                        </span>
                    </div>
                    
                    <h3 className="font-bold text-white mb-4">Firebase Configuration</h3>
                    <div className="space-y-4 mb-6">
                        <input type="text" placeholder="API Key" className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm" value={fbConfig.apiKey} onChange={e => setFbConfig({...fbConfig, apiKey: e.target.value})}/>
                        <input type="text" placeholder="Auth Domain" className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm" value={fbConfig.authDomain} onChange={e => setFbConfig({...fbConfig, authDomain: e.target.value})}/>
                        <input type="text" placeholder="Project ID" className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm" value={fbConfig.projectId} onChange={e => setFbConfig({...fbConfig, projectId: e.target.value})}/>
                    </div>
                    <button onClick={() => setFirebaseConfig(fbConfig)} className="w-full bg-app-accent hover:bg-app-accentHover text-white font-bold py-3 rounded-lg transition-colors">Save & Connect</button>
                    <p className="mt-4 text-xs text-app-textMuted text-center">Enter your Firebase credentials to enable cloud sync. Leave empty to use local storage.</p>
                </Card>
            )}
        </div>
    );
};

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAdmin, setIsAdmin] = useState<boolean>(() => { try { return window.localStorage.getItem('cs-stats-is-admin') === 'true'; } catch { return false; } });
    const login = (password: string) => { if (password === 'admin') { setIsAdmin(true); window.localStorage.setItem('cs-stats-is-admin', 'true'); return true; } return false; };
    const logout = () => { setIsAdmin(false); window.localStorage.removeItem('cs-stats-is-admin'); };
    return <AuthContext.Provider value={{ isAdmin, login, logout }}>{children}</AuthContext.Provider>;
};

const StatsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbType, setDbType] = useState<'local' | 'firebase'>('local');
  const [fbConfig, setFbConfigInternal] = useState<any>(null);

  const allPlayers = useMemo(() => aggregatePlayerStats(matches), [matches]);

  const loadData = useCallback(async () => {
      setLoading(true);
      if (dbType === 'local') {
          const data = await dbOps.getAll();
          setMatches(data);
      } else {
          // Firebase logic placeholder
      }
      setLoading(false);
  }, [dbType]);

  useEffect(() => { loadData(); }, [loadData]);

  const addMatch = useCallback(async (match: Match) => {
      if (dbType === 'local') await dbOps.add(match);
      setMatches(prev => [...prev.filter(m => m.id !== match.id), match]);
  }, [dbType]);

  const addMatches = useCallback(async (newMatches: Match[]) => {
      if (dbType === 'local') await dbOps.addBulk(newMatches);
      setMatches(prev => {
          const map = new Map(prev.map(m => [m.id, m]));
          newMatches.forEach(m => map.set(m.id, m));
          return Array.from(map.values());
      });
  }, [dbType]);

  const deleteMatch = useCallback(async (matchId: string) => {
      if (dbType === 'local') await dbOps.delete(matchId);
      setMatches(prev => prev.filter(m => m.id !== matchId));
  }, [dbType]);

  const deleteMatches = useCallback(async (matchIds: string[]) => {
      if (dbType === 'local') await dbOps.deleteBulk(matchIds);
      setMatches(prev => prev.filter(m => !matchIds.includes(m.id)));
  }, [dbType]);

  const restoreData = useCallback(async (data: Match[]) => {
      if (dbType === 'local') { await dbOps.clear(); await dbOps.addBulk(data); }
      setMatches(data);
  }, [dbType]);
  
  const setFirebaseConfig = (config: any) => {
      setFbConfigInternal(config);
      // Here you would try to initialize firebase and switch dbType if successful
  };

  return (
    <StatsContext.Provider value={{ matches, addMatch, addMatches, deleteMatch, deleteMatches, restoreData, loading, allPlayers, dbType, setFirebaseConfig }}>
      {children}
    </StatsContext.Provider>
  );
};

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [view, setView] = useState<'app' | 'admin'>('app');
  const [activeModal, setActiveModal] = useState<null | { type: 'player'; steamId: string } | { type: 'match'; match: Match }>(null);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const { loading } = useStats();
  const { isAdmin } = useAuth();
  const handleAdminClick = () => { if (isAdmin) setView('admin'); else setAuthModalOpen(true); };
  
  if (loading) return <div className="flex justify-center items-center h-screen bg-app-bg"><Activity className="animate-spin text-app-accent" size={48} /></div>;
  if (view === 'admin') return <div className="h-screen bg-app-bg text-app-text font-sans"><DataManager onBack={() => setView('app')} /></div>;
  
  const NavItem = ({ tabId, icon, label }: { tabId: string, icon: React.ReactNode, label: string }) => (<button onClick={() => setActiveTab(tabId)} className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 group relative ${activeTab === tabId ? 'bg-app-accent text-white shadow-lg shadow-app-accent/20' : 'text-gray-500 hover:bg-gray-800 hover:text-white'} flex-1 md:flex-none md:w-20 md:space-y-1`}>{icon}<span className="text-[10px] md:text-xs font-medium">{label}</span></button>);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-app-bg text-app-text font-sans overflow-hidden">
      <nav className="hidden md:flex flex-col items-center justify-between p-4 bg-app-card border-r border-gray-800 z-20 w-24"><div className="space-y-6 w-full flex flex-col items-center"><div className="mb-4"><div className="w-10 h-10 bg-app-accent rounded-lg flex items-center justify-center shadow-lg shadow-app-accent/20"><BarChart2 className="text-white" size={24} /></div></div><NavItem tabId="dashboard" icon={<LayoutDashboard size={24} />} label="Dash" /><NavItem tabId="leaderboard" icon={<Trophy size={24} />} label="Rank" /><NavItem tabId="team-builder" icon={<Users size={24} />} label="Build" /><NavItem tabId="duels" icon={<Swords size={24} />} label="Duel" /></div><div><button onClick={handleAdminClick} className={`flex flex-col items-center justify-center space-y-1 p-3 w-14 rounded-xl transition-all duration-200 ${isAdmin ? 'bg-emerald-500/10 text-emerald-500' : 'text-gray-600 hover:bg-gray-800 hover:text-white'}`}>{isAdmin ? <Shield size={24} /> : <Lock size={24} />}</button></div></nav>
      <main className="flex-1 overflow-hidden relative bg-app-bg"><div className={`${activeTab === 'dashboard' ? 'block' : 'hidden'} h-full`}><Dashboard /></div><div className={`${activeTab === 'leaderboard' ? 'block' : 'hidden'} h-full`}><SortableTable players={useStats().allPlayers} onPlayerClick={(steamId) => setActiveModal({ type: 'player', steamId })} /></div><div className={`${activeTab === 'team-builder' ? 'block' : 'hidden'} h-full`}><TeamBuilder /></div><div className={`${activeTab === 'duels' ? 'block' : 'hidden'} h-full`}><Duels /></div></main>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-app-card border-t border-gray-800 flex justify-around p-3 z-30 pb-safe shadow-2xl"><NavItem tabId="dashboard" icon={<LayoutDashboard size={22} />} label="Dash" /><NavItem tabId="leaderboard" icon={<Trophy size={22} />} label="Rank" /><NavItem tabId="team-builder" icon={<Users size={22} />} label="Build" /><NavItem tabId="duels" icon={<Swords size={22} />} label="Duel" /><button onClick={handleAdminClick} className={`flex flex-col items-center justify-center p-2 rounded-xl ${isAdmin ? 'text-emerald-500' : 'text-gray-600'} flex-1`}>{isAdmin ? <Shield size={22} /> : <Lock size={22} />}<span className="text-[10px] font-medium mt-1">Admin</span></button></nav>
      <Modal isOpen={activeModal !== null} onClose={() => setActiveModal(null)} title={activeModal?.type === 'player' ? 'Player Profile' : activeModal?.type === 'match' ? 'Match Details' : ''}>{activeModal?.type === 'player' && (<PlayerProfile steamId={activeModal.steamId} onBack={() => setActiveModal(null)} />)}{activeModal?.type === 'match' && (<MatchViewer match={activeModal.match} onBack={() => setActiveModal(null)} />)}</Modal>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => { setAuthModalOpen(false); if (isAdmin) setView('admin'); }} />
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><AuthProvider><StatsProvider><App /></StatsProvider></AuthProvider></React.StrictMode>);
