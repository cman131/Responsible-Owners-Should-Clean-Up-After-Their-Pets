import { Routes, Route } from 'react-router-dom';
import { LobbyPage } from './pages/LobbyPage.js';
import { BattlePage } from './pages/BattlePage.js';
import { AdminPage } from './pages/AdminPage.js';
import { PlayerPortalPage } from './pages/PlayerPortalPage.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/battle" element={<BattlePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/player" element={<PlayerPortalPage />} />
    </Routes>
  );
}
