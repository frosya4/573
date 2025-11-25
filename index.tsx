

import React, { useState, useEffect, useMemo, createContext, useContext, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { 
  Upload, 
  Trash2, 
  Users, 
  Trophy, 
  Swords, 
  LayoutDashboard, 
  Download, 
  FileJson, 
  Activity,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  ArrowLeft,
  Calendar,
  Gamepad2,
  FileArchive,
  BarChart2,
  Filter,
  X,
  TrendingUp,
  Percent,
  Crosshair,
  Bomb,
  Target,
  User,
  Shield,
  Shuffle,
  UserMinus,
  Ban,
  Users2
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
  [key: string]: any;
}

type SortConfig = {
  key: keyof AggregatedPlayerStats;
  direction: 'asc' | 'desc';
} | null;

interface StatsContextType {
  matches: Match[];
  addMatch: (match: Match) => void;
  addMatches: (matches: Match[]) => void;
  deleteMatch: (matchId: string) => void;
  loading: boolean;
  allPlayers: AggregatedPlayerStats[];
}

// --- Local Storage Hook ---
const useLocalStorage = <T,>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
};

// --- Context ---
const StatsContext = createContext<StatsContextType>({
  matches: [],
  addMatch: () => {},
  addMatches: () => {},
  deleteMatch: () => {},
  loading: true,
  allPlayers: [],
});

const useStats = () => useContext(StatsContext);

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

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-app-card border border-gray-700 rounded-lg p-4 shadow-lg ${className}`}>
    {children}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-app-card border border-gray-700 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-app-accent">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

const Tooltip = ({ text, children }: { text: string; children: React.ReactNode }) => (
  <div className="relative group flex items-center">
    {children}
    <div className="absolute bottom-full mb-2 w-max px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">
      {text}
    </div>
  </div>
);

const SortableTable = ({ players, onPlayerClick }: { players: AggregatedPlayerStats[], onPlayerClick: (steamId: string) => void }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'hltv_3_0_score', direction: 'desc' });
    const [searchTerm, setSearchTerm] = useState('');

    const sortedPlayers = useMemo(() => {
        let sortablePlayers = [...players];
        if (sortConfig !== null) {
            sortablePlayers.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];
                
                if (sortConfig.key === 'hltv_3_0_score') {
                    aValue = a.hltv_3_0_score / a.matches;
                    bValue = b.hltv_3_0_score / b.matches;
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortablePlayers;
    }, [players, sortConfig]);

    const requestSort = (key: keyof AggregatedPlayerStats) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const filteredPlayers = sortedPlayers.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const renderSortArrow = (key: keyof AggregatedPlayerStats) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return sortConfig.direction === 'desc' ? <ChevronDown size={16} /> : <ChevronUp size={16} />;
    };
    
    const headers: { key: keyof AggregatedPlayerStats, label: string, isNumeric?: boolean, tooltip?: string }[] = [
      { key: 'name', label: 'Player' },
      { key: 'matches', label: 'Maps', isNumeric: true, tooltip: "Matches Played" },
      { key: 'kills', label: 'K', isNumeric: true, tooltip: "Total Kills" },
      { key: 'deaths', label: 'D', isNumeric: true, tooltip: "Total Deaths" },
      { key: 'assists', label: 'A', isNumeric: true, tooltip: "Total Assists" },
      { key: 'kpr', label: 'KPR', isNumeric: true, tooltip: "Kills Per Round" },
      { key: 'adr', label: 'ADR', isNumeric: true, tooltip: "Average Damage Per Round" },
      { key: 'hltv_3_0_score', label: 'Rating', isNumeric: true, tooltip: "Average HLTV 2.0 Rating" },
    ];

    return (
        <Card className="flex-grow flex flex-col">
            <div className="p-4 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-app-accent flex items-center"><Trophy className="mr-2" /> Leaderboard</h2>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input
                        type="text"
                        placeholder="Search players..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-app-accent"
                    />
                </div>
            </div>
            <div className="overflow-x-auto flex-grow">
                <table className="w-full text-left">
                    <thead className="sticky top-0 bg-app-card">
                        <tr>
                            {headers.map(({ key, label, isNumeric, tooltip }) => (
                                <th key={key}
                                    className={`p-4 cursor-pointer hover:bg-gray-800 ${isNumeric ? 'text-right' : ''}`}
                                    onClick={() => requestSort(key)}
                                >
                                    <Tooltip text={tooltip || label}>
                                        <div className={`flex items-center ${isNumeric ? 'justify-end' : ''}`}>
                                            <span>{label}</span>
                                            {renderSortArrow(key)}
                                        </div>
                                    </Tooltip>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {filteredPlayers.map(player => {
                            const kpr = player.rounds_played ? (player.kills / player.rounds_played).toFixed(2) : '0.00';
                            const adr = player.rounds_played ? (player.damage_total / player.rounds_played).toFixed(2) : '0.00';
                            const rating = player.matches ? (player.hltv_3_0_score / player.matches).toFixed(2) : '0.00';

                            return (
                                <tr key={player.steam_id} className="hover:bg-gray-800 cursor-pointer" onClick={() => onPlayerClick(player.steam_id)}>
                                    <td className="p-4 font-medium text-app-accent">{player.name}</td>
                                    <td className="p-4 text-right">{player.matches}</td>
                                    <td className="p-4 text-right">{player.kills}</td>
                                    <td className="p-4 text-right">{player.deaths}</td>
                                    <td className="p-4 text-right">{player.assists}</td>
                                    <td className="p-4 text-right">{kpr}</td>
                                    <td className="p-4 text-right">{adr}</td>
                                    <td className="p-4 text-right font-bold">{rating}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};


const Dashboard = () => {
  const { matches, allPlayers } = useStats();

  const totalMatches = matches.length;
  const totalRounds = useMemo(() => matches.reduce((sum, m) => sum + (m.data[0]?.rounds_played || 0), 0), [matches]);
  const totalKills = useMemo(() => allPlayers.reduce((sum, p) => sum + p.kills, 0), [allPlayers]);

  const topPlayer = useMemo(() => {
    if (allPlayers.length === 0) return null;
    return [...allPlayers].sort((a, b) => (b.hltv_3_0_score / b.matches) - (a.hltv_3_0_score / a.matches))[0];
  }, [allPlayers]);

  const StatCard = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) => (
    <Card className="flex items-center space-x-4">
      <div className="text-app-accent">{icon}</div>
      <div>
        <p className="text-app-textMuted">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </Card>
  );

  return (
    <div className="p-4">
        <h1 className="text-3xl font-bold text-app-accent mb-6 flex items-center"><LayoutDashboard className="mr-2" /> Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Gamepad2 size={32} />} label="Total Matches" value={totalMatches} />
            <StatCard icon={<Activity size={32} />} label="Total Rounds" value={totalRounds} />
            <StatCard icon={<Crosshair size={32} />} label="Total Kills" value={totalKills} />
            <StatCard 
                icon={<Trophy size={32} />} 
                label="Top Player" 
                value={topPlayer ? `${topPlayer.name} (${(topPlayer.hltv_3_0_score / topPlayer.matches).toFixed(2)})` : 'N/A'} 
            />
        </div>
        <div className="mt-6">
            <p className="text-lg text-app-textMuted text-center">
                Welcome to your Counter-Strike Stats Analyzer. Upload your match data to get started!
            </p>
        </div>
    </div>
  );
};

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

    if (!playerAggregatedStats) {
        return <div className="text-center p-8">Player not found.</div>;
    }
    
    const { name, kills, deaths, assists, rounds_played, damage_total, matches: matchCount, hltv_3_0_score, sniper_kills, utility_damage, flashes_thrown } = playerAggregatedStats;
    const rating = (hltv_3_0_score / matchCount).toFixed(2);
    const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
    const adr = rounds_played > 0 ? (damage_total / rounds_played).toFixed(2) : '0.00';
    const kpr = rounds_played > 0 ? (kills / rounds_played).toFixed(2) : '0.00';

    const sniperKillPct = kills > 0 ? (sniper_kills / kills) * 100 : 0;
    const otherKillPct = 100 - sniperKillPct;

    const avgUtilDmg = matchCount > 0 ? (utility_damage / matchCount).toFixed(2) : '0.00';
    const avgFlashes = matchCount > 0 ? (flashes_thrown / matchCount).toFixed(2) : '0.00';


    return (
        <div>
            <button onClick={onBack} className="flex items-center mb-4 text-app-accent hover:text-app-accentHover">
                <ArrowLeft size={18} className="mr-2" /> Back to Leaderboard
            </button>
            <h2 className="text-3xl font-bold text-white mb-2">{name}</h2>
            <p className="text-sm text-app-textMuted mb-6">Steam ID: {steamId}</p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card><p className="text-sm text-app-textMuted">Rating</p><p className="text-2xl font-bold">{rating}</p></Card>
                <Card><p className="text-sm text-app-textMuted">K/D Ratio</p><p className="text-2xl font-bold">{kd}</p></Card>
                <Card><p className="text-sm text-app-textMuted">ADR</p><p className="text-2xl font-bold">{adr}</p></Card>
                <Card><p className="text-sm text-app-textMuted">KPR</p><p className="text-2xl font-bold">{kpr}</p></Card>
            </div>

            <Card className="mb-6">
                <h3 className="text-xl font-bold text-app-accent mb-4">Playstyle Analysis</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                         <h4 className="font-semibold text-white mb-3">Weapon Distribution</h4>
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between items-center mb-1 text-sm">
                                    <span className="font-medium flex items-center"><Target className="mr-2 text-app-accent" size={16}/> Other Kills</span>
                                    <span className="text-app-textMuted">{`${otherKillPct.toFixed(1)}% (${kills - sniper_kills})`}</span>
                                </div>
                                <div className="w-full bg-gray-700 rounded-full h-2.5">
                                    <div className="bg-app-accent h-2.5 rounded-full" style={{ width: `${otherKillPct}%` }}></div>
                                </div>
                            </div>
                             <div>
                                <div className="flex justify-between items-center mb-1 text-sm">
                                    <span className="font-medium flex items-center"><Crosshair className="mr-2 text-sky-400" size={16}/> Sniper Kills</span>
                                    <span className="text-app-textMuted">{`${sniperKillPct.toFixed(1)}% (${sniper_kills})`}</span>
                                </div>
                                <div className="w-full bg-gray-700 rounded-full h-2.5">
                                    <div className="bg-sky-400 h-2.5 rounded-full" style={{ width: `${sniperKillPct}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold text-white mb-3">Utility Usage (Per Match)</h4>
                        <div className="space-y-4">
                            <div className="flex items-center space-x-3">
                                <Tooltip text="Average Utility Damage">
                                    <Bomb size={24} className="text-app-accent"/>
                                </Tooltip>
                                <div>
                                    <p className="font-bold text-lg">{avgUtilDmg}</p>
                                    <p className="text-sm text-app-textMuted">Avg. Utility Damage</p>
                                </div>
                            </div>
                             <div className="flex items-center space-x-3">
                                <Tooltip text="Average Flashes Thrown">
                                    <Eye size={24} className="text-app-accent"/>
                                </Tooltip>
                                <div>
                                    <p className="font-bold text-lg">{avgFlashes}</p>
                                    <p className="text-sm text-app-textMuted">Avg. Flashes Thrown</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            <Card>
                <h3 className="text-xl font-bold text-app-accent mb-4">Match History ({playerMatchHistory.length})</h3>
                <div className="max-h-96 overflow-y-auto">
                     <table className="w-full text-left">
                        <thead className="sticky top-0 bg-app-card">
                            <tr>
                                <th className="p-3">Date</th>
                                <th className="p-3">File</th>
                                <th className="p-3 text-center">K</th>
                                <th className="p-3 text-center">D</th>
                                <th className="p-3 text-center">A</th>
                                <th className="p-3 text-center">Rating</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {playerMatchHistory.map(({ match, playerData }) => (
                                <tr key={match.id}>
                                    <td className="p-3 text-app-textMuted">{new Date(match.timestamp).toLocaleDateString()}</td>
                                    <td className="p-3 truncate max-w-xs">{match.filename}</td>
                                    <td className="p-3 text-center">{playerData!.kills}</td>
                                    <td className="p-3 text-center">{playerData!.deaths}</td>
                                    <td className="p-3 text-center">{playerData!.assists}</td>
                                    <td className="p-3 text-center font-semibold">{playerData!.hltv_3_0_score.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};


const MatchViewer = ({ match, onBack }: { match: Match; onBack: () => void; }) => {
    const [view, setView] = useState<'scoreboard' | 'duels'>('scoreboard');
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerStats | null>(match.data[0] || null);
    
    const sortedScoreboard = [...match.data].sort((a, b) => b.kills - a.kills);

    return (
        <div>
            <button onClick={onBack} className="flex items-center mb-4 text-app-accent hover:text-app-accentHover">
                <ArrowLeft size={18} className="mr-2" /> Back
            </button>
            <div className="mb-4">
                <h2 className="text-3xl font-bold text-white">{match.filename}</h2>
                <p className="text-sm text-app-textMuted">{new Date(match.timestamp).toLocaleString()}</p>
            </div>
            
             <div className="flex space-x-2 border-b border-gray-700 mb-4">
                <button onClick={() => setView('scoreboard')} className={`px-4 py-2 text-sm font-medium ${view === 'scoreboard' ? 'text-app-accent border-b-2 border-app-accent' : 'text-app-textMuted hover:text-white'}`}>Scoreboard</button>
                <button onClick={() => setView('duels')} className={`px-4 py-2 text-sm font-medium ${view === 'duels' ? 'text-app-accent border-b-2 border-app-accent' : 'text-app-textMuted hover:text-white'}`}>Duels</button>
            </div>
            
            {view === 'scoreboard' && (
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-gray-700">
                            <th className="p-3">Player</th>
                            <th className="p-3 text-center">K</th>
                            <th className="p-3 text-center">D</th>
                            <th className="p-3 text-center">A</th>
                            <th className="p-3 text-center">ADR</th>
                            <th className="p-3 text-center">Rating</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {sortedScoreboard.map(p => (
                            <tr key={p.steam_id.toString()}>
                                <td className="p-3 font-medium text-white">{p.name}</td>
                                <td className="p-3 text-center">{p.kills}</td>
                                <td className="p-3 text-center">{p.deaths}</td>
                                <td className="p-3 text-center">{p.assists}</td>
                                <td className="p-3 text-center">{(p.damage_total / p.rounds_played).toFixed(1)}</td>
                                <td className="p-3 text-center font-semibold">{p.hltv_3_0_score.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            
            {view === 'duels' && selectedPlayer && (
                 <div className="flex space-x-4">
                    <div className="w-1/3">
                        <h3 className="text-lg font-bold text-app-accent mb-2">Select Player</h3>
                        <div className="flex flex-col space-y-1 max-h-96 overflow-y-auto">
                            {sortedScoreboard.map(p => (
                                <button key={p.steam_id.toString()} onClick={() => setSelectedPlayer(p)} 
                                    className={`text-left p-2 rounded ${selectedPlayer.steam_id === p.steam_id ? 'bg-app-accent text-black font-bold' : 'hover:bg-gray-800'}`}>
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="w-2/3">
                         <h3 className="text-lg font-bold text-app-accent mb-2">
                             {selectedPlayer.name}'s Duels ({getWeaponRole(selectedPlayer) === 'Sniper' ? <Tooltip text="Sniper"><Crosshair className="inline-block text-sky-400" size={18}/></Tooltip> : <Tooltip text="Rifler"><Target className="inline-block text-app-accent" size={18}/></Tooltip>})
                         </h3>
                         <div className="max-h-96 overflow-y-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="p-2">Opponent</th>
                                        <th className="p-2 text-center">Kills</th>
                                        <th className="p-2 text-center">Deaths</th>
                                        <th className="p-2 text-center">Diff</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {Object.entries(selectedPlayer.duels)
                                        .sort(([, a], [, b]) => b.diff - a.diff)
                                        .map(([opponentId, duelData]) => {
                                            const opponent = match.data.find(p => p.steam_id.toString() === opponentId);
                                            const opponentRoleIcon = opponent ? (getWeaponRole(opponent) === 'Sniper' ? <Tooltip text="Sniper"><Crosshair className="inline-block text-sky-400 ml-2" size={14}/></Tooltip> : <Tooltip text="Rifler"><Target className="inline-block text-app-accent ml-2" size={14}/></Tooltip>) : null;
                                            return (
                                                <tr key={opponentId}>
                                                    <td className="p-2 flex items-center">{duelData.opponent_name} {opponentRoleIcon}</td>
                                                    <td className="p-2 text-center text-green-400">{duelData.kills}</td>
                                                    <td className="p-2 text-center text-red-400">{duelData.deaths}</td>
                                                    <td className={`p-2 text-center font-bold ${duelData.diff > 0 ? 'text-green-500' : duelData.diff < 0 ? 'text-red-500' : ''}`}>
                                                        {duelData.diff > 0 ? `+${duelData.diff}` : duelData.diff}
                                                    </td>
                                                </tr>
                                            );
                                    })}
                                </tbody>
                            </table>
                         </div>
                    </div>
                 </div>
            )}
        </div>
    );
};


const TeamBuilder = () => {
    const { allPlayers } = useStats();
    const [lobbyPlayers, setLobbyPlayers] = useState<string[]>([]);
    const [manualAssignments, setManualAssignments] = useState<Record<string, 'team1' | 'team2' | 'bench'>>({});
    const [generatedTeams, setGeneratedTeams] = useState<{ team1: AggregatedPlayerStats[], team2: AggregatedPlayerStats[] } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const addPlayerToLobby = (steamId: string) => {
        if (!lobbyPlayers.includes(steamId) && lobbyPlayers.length < 10) {
            setLobbyPlayers([...lobbyPlayers, steamId]);
        }
    };
    
    const removePlayerFromLobby = (steamId: string) => {
        setLobbyPlayers(lobbyPlayers.filter(id => id !== steamId));
        const newAssignments = { ...manualAssignments };
        delete newAssignments[steamId];
        setManualAssignments(newAssignments);
    };

    const assignPlayer = (steamId: string, team: 'team1' | 'team2' | 'bench' | null) => {
        const newAssignments = { ...manualAssignments };
        if (team === null) {
            delete newAssignments[steamId];
        } else {
            newAssignments[steamId] = team;
        }
        setManualAssignments(newAssignments);
    };

    const generateTeams = () => {
        const activePlayers = lobbyPlayers
            .filter(id => manualAssignments[id] !== 'bench')
            .map(id => allPlayers.find(p => p.steam_id === id))
            .filter((p): p is AggregatedPlayerStats => p !== undefined);

        if (activePlayers.length % 2 !== 0 || activePlayers.length < 2) {
            alert("Please select an even number of active (not benched) players.");
            return;
        }

        const teamSize = activePlayers.length / 2;
        let team1: AggregatedPlayerStats[] = activePlayers.filter(p => manualAssignments[p.steam_id] === 'team1');
        let team2: AggregatedPlayerStats[] = activePlayers.filter(p => manualAssignments[p.steam_id] === 'team2');

        const pool = activePlayers
            .filter(p => !manualAssignments[p.steam_id])
            .sort((a, b) => (b.hltv_3_0_score / b.matches) - (a.hltv_3_0_score / a.matches));
        
        pool.forEach(player => {
            const team1Rating = team1.reduce((sum, p) => sum + (p.hltv_3_0_score / p.matches), 0);
            const team2Rating = team2.reduce((sum, p) => sum + (p.hltv_3_0_score / p.matches), 0);

            if (team1.length < teamSize && (team1Rating <= team2Rating || team2.length >= teamSize)) {
                team1.push(player);
            } else if (team2.length < teamSize) {
                team2.push(player);
            }
        });
        
        setGeneratedTeams({ team1, team2 });
    };

    const lobbyPlayerDetails = useMemo(() => {
        return lobbyPlayers
            .map(id => allPlayers.find(p => p.steam_id === id))
            .filter((p): p is AggregatedPlayerStats => p !== undefined);
    }, [lobbyPlayers, allPlayers]);
    
    const filteredAllPlayers = allPlayers.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const TeamDisplay = ({ team, name }: { team: AggregatedPlayerStats[], name: string }) => {
        const totalRating = team.reduce((sum, p) => sum + (p.hltv_3_0_score / p.matches), 0);
        const avgRating = team.length > 0 ? (totalRating / team.length).toFixed(2) : '0.00';
        return (
            <Card>
                <h3 className={`text-xl font-bold ${name === 'Team Alpha' ? 'text-app-accent' : 'text-purple-400'}`}>{name}</h3>
                <p className="text-sm text-app-textMuted mb-2">Avg. Rating: {avgRating}</p>
                <ul className="space-y-2">
                    {team.map(p => (
                        <li key={p.steam_id} className="flex justify-between items-center bg-gray-800 p-2 rounded">
                            <span>{p.name}</span>
                            <span className="font-mono text-sm">{(p.hltv_3_0_score / p.matches).toFixed(2)}</span>
                        </li>
                    ))}
                </ul>
            </Card>
        );
    };

    return (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
            {/* Player Pool */}
            <div className="flex flex-col">
                <h2 className="text-2xl font-bold text-app-accent mb-4 flex items-center"><Users className="mr-2" /> Player Pool</h2>
                 <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input type="text" placeholder="Search players..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-app-accent"/>
                </div>
                <Card className="flex-grow overflow-y-auto max-h-[60vh]">
                     <ul className="divide-y divide-gray-700">
                        {filteredAllPlayers.map(p => {
                            const isInLobby = lobbyPlayers.includes(p.steam_id);
                            return (
                                <li key={p.steam_id} className={`flex justify-between items-center p-2 ${isInLobby ? 'opacity-50' : 'cursor-pointer hover:bg-gray-800'}`}
                                    onClick={() => !isInLobby && addPlayerToLobby(p.steam_id)}>
                                    <div>
                                        <p className="font-medium">{p.name}</p>
                                        <p className="text-xs text-app-textMuted">Rating: {(p.hltv_3_0_score / p.matches).toFixed(2)}</p>
                                    </div>
                                    {isInLobby && <span className="text-xs text-app-accent">In Lobby</span>}
                                </li>
                            );
                        })}
                    </ul>
                </Card>
            </div>
            {/* Lobby & Actions */}
            <div className="flex flex-col">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center"><Users2 className="mr-2" /> Match Lobby ({lobbyPlayers.length}/10)</h2>
                 <Card className="flex-grow overflow-y-auto max-h-[60vh]">
                    {lobbyPlayerDetails.length > 0 ? (
                        <ul className="divide-y divide-gray-700">
                            {lobbyPlayerDetails.map(p => (
                                <li key={p.steam_id} className={`p-2 space-y-2 ${manualAssignments[p.steam_id] === 'bench' ? 'opacity-40' : ''}`}>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="font-medium">{p.name}</p>
                                            <p className="text-xs text-app-textMuted">Rating: {(p.hltv_3_0_score / p.matches).toFixed(2)}</p>
                                        </div>
                                        <button onClick={() => removePlayerFromLobby(p.steam_id)} className="text-red-500 hover:text-red-400"><UserMinus size={18} /></button>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button onClick={() => assignPlayer(p.steam_id, 'team1')} className={`flex-1 text-xs py-1 rounded ${manualAssignments[p.steam_id] === 'team1' ? 'bg-app-accent text-black' : 'bg-gray-700 hover:bg-gray-600'}`}>Team A</button>
                                        <button onClick={() => assignPlayer(p.steam_id, null)} className={`p-1 rounded ${!manualAssignments[p.steam_id] ? 'bg-gray-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}><Shuffle size={14}/></button>
                                        <button onClick={() => assignPlayer(p.steam_id, 'team2')} className={`flex-1 text-xs py-1 rounded ${manualAssignments[p.steam_id] === 'team2' ? 'bg-purple-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Team B</button>
                                        <button onClick={() => assignPlayer(p.steam_id, 'bench')} className={`p-1 rounded ${manualAssignments[p.steam_id] === 'bench' ? 'bg-red-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}><Ban size={14}/></button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-app-textMuted p-4">Add players from the pool to the lobby.</p>
                    )}
                 </Card>
                 <button onClick={generateTeams} disabled={lobbyPlayers.length < 2}
                     className="mt-4 w-full bg-app-accent text-black font-bold py-3 rounded-lg flex items-center justify-center hover:bg-app-accentHover disabled:bg-gray-600 disabled:cursor-not-allowed">
                     <Shuffle className="mr-2" /> Generate Teams
                 </button>
            </div>
            {/* Generated Teams */}
            <div className="flex flex-col">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center"><Shield className="mr-2" /> Generated Teams</h2>
                {generatedTeams ? (
                    <div className="space-y-4">
                        <TeamDisplay team={generatedTeams.team1} name="Team Alpha" />
                        <TeamDisplay team={generatedTeams.team2} name="Team Bravo" />
                    </div>
                ) : (
                    <Card className="flex-grow flex items-center justify-center">
                        <p className="text-center text-app-textMuted">Teams will appear here after generation.</p>
                    </Card>
                )}
            </div>
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

        let p1Kills = 0;
        let p2Kills = 0;
        const history: any[] = [];

        matches.forEach(match => {
            const p1Data = match.data.find(p => p.steam_id.toString() === player1Id);
            const p2Data = match.data.find(p => p.steam_id.toString() === player2Id);

            if (p1Data && p2Data) {
                const p1Duel = p1Data.duels[player2Id];
                const p2Duel = p2Data.duels[player1Id];
                
                if (p1Duel) {
                    p1Kills += p1Duel.kills;
                    p2Kills += p1Duel.deaths;
                    history.push({
                        match,
                        p1Kills: p1Duel.kills,
                        p2Kills: p1Duel.deaths,
                        p1Role: getWeaponRole(p1Data),
                        p2Role: getWeaponRole(p2Data)
                    });
                } else if (p2Duel) {
                    p1Kills += p2Duel.deaths;
                    p2Kills += p2Duel.kills;
                    history.push({
                        match,
                        p1Kills: p2Duel.deaths,
                        p2Kills: p2Duel.kills,
                        p1Role: getWeaponRole(p1Data),
                        p2Role: getWeaponRole(p2Data)
                    });
                }
            }
        });
        
        history.sort((a,b) => b.match.timestamp - a.match.timestamp);

        return { p1, p2, p1Kills, p2Kills, history };
    }, [player1Id, player2Id, allPlayers, matches]);
    
    const PlayerSelect = ({ selectedId, onChange, otherId, label }: { selectedId: string | null; onChange: (id: string) => void; otherId: string | null; label: string; }) => (
        <div className="w-full">
            <label className="text-sm text-app-textMuted">{label}</label>
            <select
                value={selectedId || ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-app-accent"
            >
                <option value="" disabled>Select a player</option>
                {allPlayers.filter(p => p.steam_id !== otherId).map(p => (
                    <option key={p.steam_id} value={p.steam_id}>{p.name}</option>
                ))}
            </select>
        </div>
    );
    
     const ComparisonBar = ({ value1, value2, color1, color2 }: { value1: number; value2: number; color1: string; color2: string; }) => {
        const total = value1 + value2;
        const pct1 = total > 0 ? (value1 / total) * 100 : 50;
        return (
            <div className="w-full flex h-4 bg-gray-700 rounded-full overflow-hidden">
                <div style={{ width: `${pct1}%` }} className={color1}></div>
                <div style={{ width: `${100 - pct1}%` }} className={color2}></div>
            </div>
        );
    };

    // FIX: Extracted the stats configuration to a typed constant to fix TypeScript inference issues.
    const overallStatsConfig: [string, (p: AggregatedPlayerStats) => string][] = [
        ['Rating', (p) => (p.hltv_3_0_score / p.matches).toFixed(2)],
        ['K/D', (p) => (p.deaths > 0 ? p.kills / p.deaths : p.kills).toFixed(2)],
        ['ADR', (p) => (p.rounds_played > 0 ? p.damage_total / p.rounds_played : 0).toFixed(2)],
    ];

    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-3xl font-bold text-app-accent mb-6 flex items-center"><Swords className="mr-2" /> Duels</h1>
            <Card className="mb-6">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <PlayerSelect selectedId={player1Id} onChange={setPlayer1Id} otherId={player2Id} label="Player 1" />
                    <div className="text-2xl font-bold text-app-textMuted p-2">VS</div>
                    <PlayerSelect selectedId={player2Id} onChange={setPlayer2Id} otherId={player1Id} label="Player 2" />
                </div>
            </Card>

            {duelStats ? (
                <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="flex flex-col">
                        <h2 className="text-2xl font-bold text-white mb-4">Head-to-Head Stats</h2>
                        <div className="flex items-center justify-between mb-2">
                             <span className="font-bold text-app-accent text-xl">{duelStats.p1.name}</span>
                             <span className="font-bold text-purple-400 text-xl">{duelStats.p2.name}</span>
                        </div>
                         <div className="flex items-center justify-between mb-4">
                             <span className="font-bold text-white text-3xl">{duelStats.p1Kills}</span>
                             <span className="text-app-textMuted">Total Kills</span>
                             <span className="font-bold text-white text-3xl">{duelStats.p2Kills}</span>
                        </div>
                        <ComparisonBar value1={duelStats.p1Kills} value2={duelStats.p2Kills} color1="bg-app-accent" color2="bg-purple-400" />
                        <div className="flex justify-between mt-1 text-xs text-app-textMuted">
                            <span>{duelStats.p1Kills + duelStats.p2Kills > 0 ? ((duelStats.p1Kills / (duelStats.p1Kills + duelStats.p2Kills)) * 100).toFixed(1) + '%' : '50.0%'}</span>
                            <span>{duelStats.p1Kills + duelStats.p2Kills > 0 ? ((duelStats.p2Kills / (duelStats.p1Kills + duelStats.p2Kills)) * 100).toFixed(1) + '%' : '50.0%'}</span>
                        </div>

                        <div className="mt-6 border-t border-gray-700 pt-4">
                            <h3 className="text-lg font-bold text-white mb-2">Overall Stats</h3>
                            {overallStatsConfig.map(([label, statFn]) => (
                                <div key={label} className="mt-2">
                                    <div className="flex justify-between items-center text-sm mb-1">
                                        <span>{statFn(duelStats.p1)}</span>
                                        <span className="text-app-textMuted">{label}</span>
                                        <span>{statFn(duelStats.p2)}</span>
                                    </div>
                                    <ComparisonBar value1={parseFloat(statFn(duelStats.p1))} value2={parseFloat(statFn(duelStats.p2))} color1="bg-app-accent" color2="bg-purple-400" />
                                </div>
                             ))}
                        </div>
                    </Card>
                    <Card className="flex flex-col">
                        <h2 className="text-2xl font-bold text-white mb-4">Match History</h2>
                        <div className="flex-grow overflow-y-auto">
                           <table className="w-full text-left">
                                <thead className="sticky top-0 bg-app-card">
                                    <tr>
                                        <th className="p-2">Date</th>
                                        <th className="p-2 text-center">Score</th>
                                        <th className="p-2 text-center">Roles</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {duelStats.history.map(({match, p1Kills, p2Kills, p1Role, p2Role}, index) => (
                                        <tr key={index}>
                                            <td className="p-2 text-sm text-app-textMuted">{new Date(match.timestamp).toLocaleDateString()}</td>
                                            <td className="p-2 text-center font-mono">
                                                <span className="text-app-accent">{p1Kills}</span> - <span className="text-purple-400">{p2Kills}</span>
                                            </td>
                                            <td className="p-2 text-center flex items-center justify-center space-x-2">
                                                {p1Role === 'Sniper' ? <Tooltip text={`${duelStats.p1.name}: Sniper`}><Crosshair className="text-sky-400" size={16}/></Tooltip> : <Tooltip text={`${duelStats.p1.name}: Rifler`}><Target className="text-app-accent" size={16}/></Tooltip>}
                                                <span className="text-gray-500">vs</span>
                                                {p2Role === 'Sniper' ? <Tooltip text={`${duelStats.p2.name}: Sniper`}><Crosshair className="text-sky-400" size={16}/></Tooltip> : <Tooltip text={`${duelStats.p2.name}: Rifler`}><Target className="text-purple-400" size={16}/></Tooltip>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                           </table>
                        </div>
                    </Card>
                </div>
            ) : (
                <Card className="flex-grow flex items-center justify-center">
                    <p className="text-center text-app-textMuted">Select two players to compare their head-to-head performance.</p>
                </Card>
            )}
        </div>
    );
};


const DataManager = () => {
    const { matches, addMatch, addMatches, deleteMatch } = useStats();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const newMatches: Match[] = [];

        for (const file of Array.from(files)) {
            if (file.name.endsWith('.json')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const content = event.target?.result as string;
                        // Pre-process to wrap steam_id in quotes
                        const safeContent = content.replace(/"steam_id":\s*(\d+)/g, '"steam_id": "$1"');
                        const data = JSON.parse(safeContent);
                        if (Array.isArray(data)) {
                             addMatch({
                                id: crypto.randomUUID(),
                                filename: file.name,
                                timestamp: parseDateFromFilename(file.name),
                                data: data,
                            });
                        }
                    } catch (err) {
                        console.error("Failed to parse JSON file:", file.name, err);
                        alert(`Error parsing ${file.name}. It might be a malformed JSON.`);
                    }
                };
                reader.readAsText(file);
            } else if (file.name.endsWith('.zip')) {
                const zip = new JSZip();
                try {
                    const content = await zip.loadAsync(file);
                    for (const filename in content.files) {
                        if (filename.endsWith('.json')) {
                            const fileContent = await content.files[filename].async('string');
                            try {
                                const safeContent = fileContent.replace(/"steam_id":\s*(\d+)/g, '"steam_id": "$1"');
                                const data = JSON.parse(safeContent);
                                if(Array.isArray(data)) {
                                    newMatches.push({
                                        id: crypto.randomUUID(),
                                        filename: filename,
                                        timestamp: parseDateFromFilename(filename),
                                        data: data
                                    });
                                }
                            } catch (err) {
                                 console.error("Failed to parse JSON from ZIP:", filename, err);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to process ZIP file:", file.name, err);
                    alert(`Error processing ${file.name}. It might be a corrupted ZIP.`);
                }
            }
        }
        if (newMatches.length > 0) {
            addMatches(newMatches);
        }
        
        // Reset file input
        if(fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };
    
    const exportToCSV = () => {
        const aggregated = aggregatePlayerStats(matches);
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Player,SteamID,Matches,Kills,Deaths,Assists,KDR,ADR,AvgRating\r\n";

        aggregated.forEach(p => {
            const kdr = (p.deaths > 0 ? p.kills / p.deaths : p.kills).toFixed(2);
            const adr = (p.rounds_played > 0 ? p.damage_total / p.rounds_played : 0).toFixed(2);
            const rating = (p.matches > 0 ? p.hltv_3_0_score / p.matches : 0).toFixed(2);
            csvContent += `${p.name},${p.steam_id},${p.matches},${p.kills},${p.deaths},${p.assists},${kdr},${adr},${rating}\r\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "player_stats.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-3xl font-bold text-app-accent mb-6 flex items-center"><FileJson className="mr-2" /> Data Management</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <button onClick={() => fileInputRef.current?.click()} className="bg-app-accent text-black font-bold py-3 rounded-lg flex items-center justify-center hover:bg-app-accentHover">
                    <Upload className="mr-2" /> Upload JSON or ZIP
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json,.zip" multiple className="hidden" />
                 <button onClick={exportToCSV} disabled={matches.length === 0} className="bg-sky-500 text-white font-bold py-3 rounded-lg flex items-center justify-center hover:bg-sky-600 disabled:bg-gray-600">
                    <Download className="mr-2" /> Export Aggregated CSV
                </button>
            </div>
            
            <Card className="flex-grow flex flex-col">
                <h2 className="text-xl font-bold text-white mb-4">Uploaded Matches ({matches.length})</h2>
                <div className="overflow-y-auto flex-grow">
                    {matches.length > 0 ? (
                        <ul className="divide-y divide-gray-700">
                            {matches.sort((a,b) => b.timestamp - a.timestamp).map(match => (
                                <li key={match.id} className="flex justify-between items-center p-3 hover:bg-gray-800">
                                    <div>
                                        <p className="font-medium">{match.filename}</p>
                                        <p className="text-sm text-app-textMuted">{new Date(match.timestamp).toLocaleString()}</p>
                                    </div>
                                    <button onClick={() => deleteMatch(match.id)} className="text-app-danger hover:text-red-400">
                                        <Trash2 size={20} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="h-full flex items-center justify-center">
                            <p className="text-app-textMuted">No matches uploaded yet.</p>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
};


const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeModal, setActiveModal] = useState<null | { type: 'player'; steamId: string } | { type: 'match'; match: Match }>(null);

  const { loading } = useStats();

  const renderTab = () => {
    switch (activeTab) {
      case 'leaderboard':
        return <SortableTable players={useStats().allPlayers} onPlayerClick={(steamId) => setActiveModal({ type: 'player', steamId })} />;
      case 'team-builder':
        return <TeamBuilder />;
      case 'duels':
        return <Duels />;
      case 'data':
        return <DataManager />;
      case 'dashboard':
      default:
        return <Dashboard />;
    }
  };

  if (loading) {
      return <div className="flex justify-center items-center h-screen"><Activity className="animate-spin text-app-accent" size={48} /></div>;
  }
  
  const NavItem = ({ tabId, icon, label }: { tabId: string, icon: React.ReactNode, label: string }) => (
    <button onClick={() => setActiveTab(tabId)}
        className={`flex flex-col items-center justify-center space-y-1 p-2 w-24 rounded-lg transition-colors duration-200 ${activeTab === tabId ? 'bg-app-accent text-black' : 'text-app-textMuted hover:bg-gray-800 hover:text-white'}`}>
        {icon}
        <span className="text-xs font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-app-bg text-app-text font-sans">
      <nav className="flex flex-col items-center space-y-4 p-4 bg-app-card border-r border-gray-800">
        <NavItem tabId="dashboard" icon={<LayoutDashboard size={24} />} label="Dashboard" />
        <NavItem tabId="leaderboard" icon={<Trophy size={24} />} label="Leaderboard" />
        <NavItem tabId="team-builder" icon={<Users size={24} />} label="Team Builder" />
        <NavItem tabId="duels" icon={<Swords size={24} />} label="Duels" />
        <NavItem tabId="data" icon={<FileJson size={24} />} label="Data" />
      </nav>
      <main className="flex-1 overflow-y-auto">
        {renderTab()}
      </main>
      
      <Modal
        isOpen={activeModal?.type === 'player'}
        onClose={() => setActiveModal(null)}
        title="Player Profile"
      >
        {activeModal?.type === 'player' && <PlayerProfile steamId={activeModal.steamId} onBack={() => setActiveModal(null)} />}
      </Modal>

       <Modal
        isOpen={activeModal?.type === 'match'}
        onClose={() => setActiveModal(null)}
        title="Match Details"
      >
        {activeModal?.type === 'match' && <MatchViewer match={activeModal.match} onBack={() => setActiveModal(null)} />}
      </Modal>
    </div>
  );
};

const StatsProvider = ({ children }: { children: React.ReactNode }) => {
    const [matches, setMatches] = useLocalStorage<Match[]>('cs-stats-matches', []);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(false);
    }, []);

    const addMatch = useCallback((match: Match) => {
        setMatches(prev => [...prev, match]);
    }, [setMatches]);
    
    const addMatches = useCallback((newMatches: Match[]) => {
        setMatches(prev => [...prev, ...newMatches]);
    }, [setMatches]);

    const deleteMatch = useCallback((matchId: string) => {
        setMatches(prev => prev.filter(m => m.id !== matchId));
    }, [setMatches]);

    const allPlayers = useMemo(() => aggregatePlayerStats(matches), [matches]);

    return (
        <StatsContext.Provider value={{ matches, addMatch, addMatches, deleteMatch, loading, allPlayers }}>
            {children}
        </StatsContext.Provider>
    );
};


const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <StatsProvider>
        <App />
    </StatsProvider>
  </React.StrictMode>
);