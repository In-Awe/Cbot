
import React from 'react';

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Slider: React.FC<SliderProps> = ({ className = '', ...props }) => {
    const baseClasses = 'w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-thumb:appearance-none range-thumb:w-5 range-thumb:h-5 range-thumb:bg-cyan-500 range-thumb:rounded-full';

    return (
        <input type="range" className={`${baseClasses} ${className}`} {...props} />
    );
};
