import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { api } from '@/lib/api';
import { Learning } from '@/types/learning';

// ── State ─────────────────────────────────────────────────────────────────────

interface LearningsState {
  items: Learning[];
  selectedId: string | null;
  loading: boolean;
  statusRefreshing: boolean;
  uploading: boolean;
  uploadProgress: number;
  error: string | null;
}

const initialState: LearningsState = {
  items: [],
  selectedId: null,
  loading: false,
  statusRefreshing: false,
  uploading: false,
  uploadProgress: 0,
  error: null,
};

// ── Async Thunks ──────────────────────────────────────────────────────────────

export const fetchLearnings = createAsyncThunk(
  'learnings/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const { learnings } = await api.learnings.list();
      return learnings;
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  }
);

export const fetchLearningById = createAsyncThunk(
  'learnings/fetchById',
  async (id: string, { rejectWithValue }) => {
    try {
      const { learning } = await api.learnings.get(id);
      return learning;
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  }
);

export const createLearning = createAsyncThunk(
  'learnings/create',
  async (payload: { title: string; description?: string }, { rejectWithValue }) => {
    try {
      const { learning } = await api.learnings.create(payload);
      return learning;
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  }
);

export const deleteLearning = createAsyncThunk(
  'learnings/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await api.learnings.delete(id);
      return id;
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  }
);

export const uploadPdf = createAsyncThunk(
  'learnings/uploadPdf',
  async ({ id, file }: { id: string; file: File }, { rejectWithValue, dispatch }) => {
    try {
      const result = await api.learnings.uploadPdf(id, file, (pct) => {
        dispatch(setUploadProgress(pct));
      });
      return result.learning;
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  }
);

export const fetchLearningStatus = createAsyncThunk(
  'learnings/fetchStatus',
  async (id: string, { rejectWithValue }) => {
    try {
      const { learning } = await api.learnings.status(id);
      return learning;
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  }
);

export const restartIngestion = createAsyncThunk(
  'learnings/restartIngestion',
  async (id: string, { rejectWithValue }) => {
    try {
      const { learning } = await api.learnings.reprocess(id);
      return learning;
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  }
);

export const updateLearning = createAsyncThunk(
  'learnings/update',
  async (
    { id, ...payload }: { id: string; title?: string; description?: string },
    { rejectWithValue }
  ) => {
    try {
      const { learning } = await api.learnings.update(id, payload);
      return learning;
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  }
);

// ── Slice ─────────────────────────────────────────────────────────────────────

const learningsSlice = createSlice({
  name: 'learnings',
  initialState,
  reducers: {
    selectLearning(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
    setUploadProgress(state, action: PayloadAction<number>) {
      state.uploadProgress = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLearnings.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchLearnings.fulfilled, (state, action) => { state.loading = false; state.items = action.payload; })
      .addCase(fetchLearnings.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });

    builder
      .addCase(fetchLearningById.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchLearningById.fulfilled, (state, action) => {
        state.loading = false;
        const idx = state.items.findIndex((l) => l.id === action.payload.id);
        if (idx !== -1) state.items[idx] = action.payload;
        else state.items.unshift(action.payload);
      })
      .addCase(fetchLearningById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(createLearning.pending, (state) => { state.loading = true; })
      .addCase(createLearning.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.selectedId = action.payload.id;
      })
      .addCase(createLearning.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });

    builder
      .addCase(deleteLearning.fulfilled, (state, action) => {
        state.items = state.items.filter((l) => l.id !== action.payload);
        if (state.selectedId === action.payload) state.selectedId = null;
      })
      .addCase(deleteLearning.rejected, (state, action) => { state.error = action.payload as string; });

    builder
      .addCase(uploadPdf.pending, (state) => { state.uploading = true; state.uploadProgress = 0; state.error = null; })
      .addCase(uploadPdf.fulfilled, (state, action) => {
        state.uploading = false;
        state.uploadProgress = 100;
        const idx = state.items.findIndex((l) => l.id === action.payload.id);
        if (idx !== -1) state.items[idx] = action.payload;
      })
      .addCase(uploadPdf.rejected, (state, action) => { state.uploading = false; state.error = action.payload as string; });

    builder
      .addCase(fetchLearningStatus.pending, (state) => { state.statusRefreshing = true; })
      .addCase(fetchLearningStatus.fulfilled, (state, action) => {
        state.statusRefreshing = false;
        const idx = state.items.findIndex((l) => l.id === action.payload.id);
        if (idx !== -1) {
          state.items[idx] = action.payload;
        } else {
          state.items.unshift(action.payload);
        }
      })
      .addCase(fetchLearningStatus.rejected, (state, action) => {
        state.statusRefreshing = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(restartIngestion.pending, (state) => { state.error = null; })
      .addCase(restartIngestion.fulfilled, (state, action) => {
        const idx = state.items.findIndex((l) => l.id === action.payload.id);
        if (idx !== -1) {
          state.items[idx] = action.payload;
        }
      })
      .addCase(restartIngestion.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    builder
      .addCase(updateLearning.fulfilled, (state, action) => {
        const idx = state.items.findIndex((l) => l.id === action.payload.id);
        if (idx !== -1) state.items[idx] = action.payload;
      })
      .addCase(updateLearning.rejected, (state, action) => { state.error = action.payload as string; });
  },
});

export const { selectLearning, clearError, setUploadProgress } = learningsSlice.actions;
export default learningsSlice.reducer;
