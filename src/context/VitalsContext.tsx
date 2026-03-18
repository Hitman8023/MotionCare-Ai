import React, { createContext, useContext, useEffect, useState } from 'react';

type VitalsContextType = {
    hr: number;
    hrBuf: number[];
    spo2: number;
    spo2Buf: number[];
    temp: number;
    tempBuf: number[];
    emg: number;
    emgBuf: number[];
    elapsed: number;
};

const VitalsContext = createContext<VitalsContextType | undefined>(undefined);

export const VitalsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [hr, setHr] = useState(78);
    const [spo2, setSpo2] = useState(97.8);
    const [temp, setTemp] = useState(36.7);
    const [emg, setEmg] = useState(45);
    const [hrBuf, setHrBuf] = useState<number[]>(() => Array.from({ length: 60 }, (_, i) => 72 + Math.sin(i * 0.2) * 6 + Math.random() * 3));
    const [spo2Buf, setSpo2Buf] = useState<number[]>(() => Array.from({ length: 60 }, (_, i) => 97 + Math.sin(i * 0.15) * 0.6 + Math.random() * 0.3));
    const [tempBuf, setTempBuf] = useState<number[]>(() => Array.from({ length: 60 }, (_, i) => 36.5 + Math.sin(i * 0.1) * 0.2 + Math.random() * 0.1));
    const [emgBuf, setEmgBuf] = useState<number[]>(() => Array.from({ length: 60 }, (_, i) => 40 + Math.sin(i * 0.3) * 15 + Math.random() * 10));
    const [elapsed, setElapsed] = useState(2537);

    useEffect(() => {
        const tick = setInterval(() => setElapsed(e => e + 1), 1000);
        const dataInterval = setInterval(() => {
            const now = Date.now();
            const newHr = Math.round(72 + Math.sin(now / 3000) * 8 + Math.random() * 4);
            setHr(newHr); setHrBuf(p => [...p.slice(1), newHr]);
            
            const newSpo2 = 97 + Math.sin(now / 5000) * 0.8 + Math.random() * 0.3;
            setSpo2(newSpo2); setSpo2Buf(p => [...p.slice(1), newSpo2]);
            
            const newTemp = 36.6 + Math.sin(now / 7000) * 0.2 + Math.random() * 0.05;
            setTemp(newTemp); setTempBuf(p => [...p.slice(1), newTemp]);
            
            const newEmg = Math.round(40 + Math.sin(now / 2000) * 18 + Math.random() * 8);
            setEmg(newEmg); setEmgBuf(p => [...p.slice(1), newEmg]);
        }, 800);
        return () => { clearInterval(tick); clearInterval(dataInterval); };
    }, []);

    return (
        <VitalsContext.Provider value={{ hr, hrBuf, spo2, spo2Buf, temp, tempBuf, emg, emgBuf, elapsed }}>
            {children}
        </VitalsContext.Provider>
    );
};

export const useVitals = () => {
    const context = useContext(VitalsContext);
    if (context === undefined) {
        throw new Error('useVitals must be used within a VitalsProvider');
    }
    return context;
};
