import { configureStore } from '@reduxjs/toolkit';
import learningsReducer from './learningsSlice';

export const store = configureStore({
  reducer: {
    learnings: learningsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
