import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { AuthProvider } from '@/contexts/AuthContext';
import { store } from '@/store';
import AppRoutes from '@/router/AppRoutes';

export default function App() {
  return (
    <AuthProvider>
      <Provider store={store}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </Provider>
    </AuthProvider>
  );
}
