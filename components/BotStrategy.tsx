
import React from 'react';
import { Card } from './ui/Card';
import { BOT_STRATEGY_SCRIPT } from '../constants';
import { ClipboardIcon } from './icons/ClipboardIcon';

export const BotStrategy: React.FC = () => {
    const [copyButtonText, setCopyButtonText] = React.useState('Copy Code');

    const handleCopy = () => {
        navigator.clipboard.writeText(BOT_STRATEGY_SCRIPT);
        setCopyButtonText('Copied!');
        setTimeout(() => setCopyButtonText('Copy Code'), 2000);
    };

    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-100">Bot Strategy Script</h2>
                 <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors"
                >
                    <ClipboardIcon />
                    <span>{copyButtonText}</span>
                </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
                This is the live JavaScript code powering the Internal Bot. You can copy it to analyze, modify, or test it externally.
            </p>
            <div className="max-h-96 overflow-y-auto bg-gray-900/70 p-4 rounded-md border border-gray-700">
                <pre className="text-xs text-cyan-300 font-mono">
                    <code>
                        {BOT_STRATEGY_SCRIPT}
                    </code>
                </pre>
            </div>
        </Card>
    );
};
