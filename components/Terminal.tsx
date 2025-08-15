import React, { useState, useRef, useEffect } from 'react';
import type { TerminalLogEntry } from '../types';
import { ChevronUpIcon } from './icons/ChevronUpIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { DownloadIcon } from './icons/DownloadIcon';

interface TerminalProps {
    logs: TerminalLogEntry[];
    onExport: () => void;
}

const getLogTypeClasses = (type: TerminalLogEntry['type']) => {
    switch (type) {
        case 'info': return 'text-cyan-400';
        case 'request': return 'text-yellow-400';
        case 'response': return 'text-green-400';
        case 'error': return 'text-red-400';
        default: return 'text-gray-400';
    }
}

const LogEntry: React.FC<{ entry: TerminalLogEntry }> = ({ entry }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    return (
        <div className="font-mono text-xs border-b border-gray-700/50 py-1.5 pr-2">
            <div className="flex gap-4">
                <span className="text-gray-500 flex-shrink-0">{entry.timestamp.toLocaleTimeString()}</span>
                <span className={`font-semibold uppercase flex-shrink-0 ${getLogTypeClasses(entry.type)}`}>[{entry.type}]</span>
                <p className="text-gray-300 break-words flex-grow">
                    {entry.message}
                    {entry.data && (
                        <button onClick={() => setIsExpanded(!isExpanded)} className="ml-2 text-gray-500 hover:text-white">[ {isExpanded ? 'Hide' : 'Show'} Data ]</button>
                    )}
                </p>
            </div>
            {isExpanded && entry.data && (
                <pre className="bg-gray-900/70 p-2 rounded mt-1 overflow-x-auto text-sky-300 text-[11px]">
                    <code>{entry.data}</code>
                </pre>
            )}
        </div>
    )
};

export const Terminal: React.FC<TerminalProps> = ({ logs, onExport }) => {
    const [isOpen, setIsOpen] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [logs, isOpen]);

    return (
        <footer className={`bg-gray-800/80 backdrop-blur-sm border-t border-gray-700/50 transition-all duration-300 ease-in-out ${isOpen ? 'h-64' : 'h-10'} flex flex-col fixed bottom-0 left-0 right-0 z-20`}>
            <div className="w-full flex items-center justify-between px-4 py-2 bg-gray-900/50 text-gray-300 text-sm font-semibold">
                <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2">
                     <span>Live Terminal</span>
                     {isOpen ? <ChevronDownIcon /> : <ChevronUpIcon />}
                </button>
                <div className="flex items-center gap-4">
                     <button 
                        onClick={onExport}
                        disabled={logs.length === 0}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <DownloadIcon />
                        <span>Export CSV</span>
                    </button>
                    <button onClick={() => setIsOpen(!isOpen)} className="flex items-center">
                         {isOpen ? <ChevronDownIcon /> : <ChevronUpIcon />}
                    </button>
                </div>
            </div>

            {isOpen && (
                 <div ref={scrollRef} className="flex-grow overflow-y-auto px-4">
                    {logs.map(log => <LogEntry key={log.id} entry={log} />)}
                </div>
            )}
        </footer>
    );
};