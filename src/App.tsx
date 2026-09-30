/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import RepairsList from './pages/RepairsList';
import RepairForm from './pages/RepairForm';
import Planner from './pages/Planner';
import SmallOrders from './pages/SmallOrders';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="repairs" element={<RepairsList />} />
          <Route path="repairs/new" element={<RepairForm />} />
          <Route path="repairs/:id" element={<RepairForm />} />
          <Route path="planner" element={<Planner />} />
          <Route path="small-orders" element={<SmallOrders />} />
          <Route path="customers" element={<div className="p-8 text-white">Zákazníci (Pripravuje sa)</div>} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
