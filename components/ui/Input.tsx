
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input: React.FC<InputProps> = ({ className = '', ...props }) => {
    const baseClasses = 'w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-md text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors';
    return (
        <input className={`${baseClasses} ${className}`} {...props} />
    );
};
