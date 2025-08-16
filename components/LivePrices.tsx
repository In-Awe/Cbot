
import React, { useRef, useEffect } from 'react';
import { Card } from './ui/Card';
import type { PriceHistoryLogEntry } from '../types';

interface LivePricesProps {
    price: PriceHistoryLogEntry | undefined;
}

const PriceRow: React.FC<{ pair: string, priceData: PriceHistoryLogEntry | undefined }> = ({ pair, priceData }) => {
    const priceRef = useRef<HTMLSpanElement>(null);
    const prevPriceRef = useRef<number | undefined>(priceData?.close);
    
    const price = priceData?.close;

    useEffect(() => {
        if (price !== undefined && priceRef.current) {
            const prevPrice = prevPriceRef.current;
            
            priceRef.current.classList.remove('text-green-400', 'text-red-400', 'text-gray-100');
            
            if (prevPrice !== undefined) {
                if (price > prevPrice) {
                    priceRef.current.classList.add('text-green-400');
                } else if (price < prevPrice) {
                    priceRef.current.classList.add('text-red-400');
                } else {
                    priceRef.current.classList.add('text-gray-100');
                }
            } else {
                priceRef.current.classList.add('text-gray-100');
            }
            
            prevPriceRef.current = price;
        }
    }, [price]);

    return (
        <div className="flex justify-between items-center py-2">
            <span className="font-medium text-gray-300">{pair}</span>
            <span ref={priceRef} className="font-mono text-2xl transition-colors duration-300">
                {price !== undefined ? `$${price.toFixed(2)}` : <span className="text-gray-500">...</span>}
            </span>
        </div>
    );
};

export const LivePrices: React.FC<LivePricesProps> = ({ price }) => {
    return (
        <Card>
            <h3 className="text-lg font-semibold text-cyan-400 mb-4">Live BTC/USDT Price</h3>
             <PriceRow pair="BTC/USDT" priceData={price} />
        </Card>
    );
};
