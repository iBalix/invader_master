/**
 * Layout principal : Sidebar + Header + zone contenu
 */

import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="ml-64">
        <Header />
        <main className="pt-20 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
