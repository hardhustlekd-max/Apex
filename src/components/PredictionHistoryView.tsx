import React, { useEffect, useState } from 'react';
import { Fixture } from '../core/types';
import { predictionsDb } from '../core/predictionsDb';

export const PredictionHistoryView: React.FC = () => {
  const [history, setHistory] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await predictionsDb.getHistoricalPredictions({ limit: 50 });
        setHistory(data);
      } catch (err) {
        console.error('Error fetching historical predictions:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (isLoading) {
    return <div className="text-center py-10">Loading history...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Prediction History</h2>
      {history.length === 0 ? (
        <div className="text-center py-10">No historical predictions found.</div>
      ) : (
        <div className="space-y-2">
          {history.map((f) => {
            const isCorrect = (f.score?.home ?? 0) === (f.score?.away ?? 0) 
              ? f.prediction?.drawProb && f.prediction.drawProb > 0.5 // Simplified logic
              : f.score?.home && f.score.away && (
                  (f.score.home > f.score.away && f.prediction?.homeWinProb && f.prediction.homeWinProb > 0.5) ||
                  (f.score.away > f.score.home && f.prediction?.awayWinProb && f.prediction.awayWinProb > 0.5)
                );

            return (
              <div key={f.id} className="bg-white p-4 rounded-xl shadow-sm border border-zinc-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{f.homeTeam} vs {f.awayTeam}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                </div>
                <div className="text-sm text-zinc-500">
                  Result: {f.score?.home} - {f.score?.away} | Predicted: {f.prediction?.homeWinProb ? 'Win' : 'Other'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
