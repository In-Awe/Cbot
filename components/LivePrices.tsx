import React, { useRef, useEffect } from 'react';
import { Card } from './ui/Card';

interface LivePricesProps {
    prices: Record<string, number>;
    trading_pairs: string[];
}

const PriceRow: React.FC<{ pair: string, price: number | undefined }> = ({ pair, price }) => {
    const priceRef = useRef<HTMLSpanElement>(null);
    const prevPriceRef = useRef<number | undefined>(price);

    useEffect(() => {
        if (price !== undefined && priceRef.current) {
            const prevPrice = prevPriceRef.current;
            
            // Reset classes
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
        <div className="flex justify-between items-center py-2 border-b border-gray-700/50 last:border-b-0">
            <span className="font-medium text-gray-300">{pair}</span>
            <span ref={priceRef} className="font-mono transition-colors duration-300">
                {price !== undefined ? `$${price.toFixed(4)}` : <span className="text-gray-500">...</span>}
            </span>
        </div>
    );
};

export const LivePrices: React.FC<LivePricesProps> = ({ prices, trading_pairs }) => {
    return (
        <Card>
            <h3 className="text-lg font-semibold text-cyan-400 mb-4">Live Market Prices</h3>
            {trading_pairs.length > 0 ? (
                <div className="space-y-1">
                    {trading_pairs.map(pair => (
                        <PriceRow key={pair} pair={pair} price={prices[pair]} />
                    ))}
                </div>
            ) : (
                <p className="text-sm text-gray-500 text-center py-4">No trading pairs configured.</p>
            )}
        </Card>
    );
};
