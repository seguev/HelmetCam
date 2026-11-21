import { useEffect, useState, type RefObject } from 'react';

const SAMPLE_INTERVAL_MS = 1000;
const SAMPLES_AVERAGED = 5;

export function useTransferSpeed(bytesReceived: RefObject<number>, active: boolean): number {
  const [bytesPerSecond, setBytesPerSecond] = useState(0);

  useEffect(() => {
    if (!active) return;
    let lastBytes = bytesReceived.current;
    let lastTime = Date.now();
    const samples: number[] = [];
    const timer = setInterval(() => {
      const now = Date.now();
      samples.push((bytesReceived.current - lastBytes) / ((now - lastTime) / 1000));
      if (samples.length > SAMPLES_AVERAGED) samples.shift();
      lastBytes = bytesReceived.current;
      lastTime = now;
      setBytesPerSecond(samples.reduce((sum, sample) => sum + sample, 0) / samples.length);
    }, SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, bytesReceived]);

  return bytesPerSecond;
}
