
import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { ClipboardIcon } from './icons/ClipboardIcon';

interface ManualAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (responseText: string) => void;
    prompt: string;
}

export const ManualAnalysisModal: React.FC<ManualAnalysisModalProps> = ({ isOpen, onClose, onSubmit, prompt }) => {
    const [responseText, setResponseText] = useState('');
    const [copyButtonText, setCopyButtonText] = useState('Copy Prompt');

    useEffect(() => {
        if (isOpen) {
            setResponseText('');
            setCopyButtonText('Copy Prompt');
        }
    }, [isOpen]);

    if (!isOpen) {
        return null;
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(prompt);
        setCopyButtonText('Copied!');
        setTimeout(() => setCopyButtonText('Copy Prompt'), 2000);
    };

    const handleSubmit = () => {
        if (responseText.trim() === '') {
            alert('Please paste the JSON response from the chatbot.');
            return;
        }
        onSubmit(responseText);
    };

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="w-full max-w-4xl"
                onClick={e => e.stopPropagation()}
            >
                <Card className="max-h-[90vh] flex flex-col">
                    <h2 className="text-2xl font-bold text-gray-100 mb-4 flex-shrink-0">Manual AI Analysis</h2>
                    <p className="text-sm text-gray-400 mb-4 flex-shrink-0">
                        1. Copy the prompt below and paste it into your AI Chatbot (e.g., AI Studio).
                        <br />
                        2. Paste the full JSON response from the chatbot into the response box and submit.
                    </p>
                    
                    <div className="flex flex-col lg:flex-row gap-4 flex-grow min-h-0">
                        {/* Prompt Section */}
                        <div className="flex-1 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium text-gray-300">Generated Prompt</label>
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors"
                                >
                                    <ClipboardIcon />
                                    <span>{copyButtonText}</span>
                                </button>
                            </div>
                            <textarea
                                readOnly
                                value={prompt}
                                className="w-full h-full flex-grow p-3 bg-gray-900/50 border border-gray-600 rounded-md text-gray-300 text-xs font-mono resize-none focus:outline-none"
                            />
                        </div>

                        {/* Response Section */}
                        <div className="flex-1 flex flex-col">
                            <label htmlFor="response-text" className="block text-sm font-medium text-gray-300 mb-2">Chatbot JSON Response</label>
                             <textarea
                                id="response-text"
                                value={responseText}
                                onChange={(e) => setResponseText(e.target.value)}
                                placeholder='Paste the JSON response here...'
                                className="w-full h-full flex-grow p-3 bg-gray-700/50 border border-gray-600 rounded-md text-gray-200 placeholder-gray-400 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-6 flex-shrink-0">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button variant="primary" onClick={handleSubmit}>Submit Analysis</Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};
