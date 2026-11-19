import { Router, Request, Response } from 'express';
import { db } from '../core/db.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    db.evaluateBets();
    const bets = db.getAllBets();
    res.json({ success: true, count: bets.length, bets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch bets' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const bet = req.body;
    if (!bet || !bet.id || !Array.isArray(bet.selections)) {
      return res.status(400).json({ success: false, error: 'Invalid bet object format' });
    }
    db.saveBet(bet);
    res.json({ success: true, message: 'Bet saved successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save bet' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    db.deleteBet(id);
    res.json({ success: true, message: 'Bet deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete bet' });
  }
});

export const betsRouter = router;
