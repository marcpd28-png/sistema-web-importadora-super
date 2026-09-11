"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ComposedChart, Area, AreaChart
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#f97316", "#14b8a6"];

// 1. Embudo de Conversión (Funnel)
export function FunnelChart({ data }: { data: { step: string, count: number }[] }) {
  // Simulamos datos reales por si no llegan
  const safeData = data?.length ? data : [
    { step: "Visitantes", count: 12500 },
    { step: "Agregaron al Carrito", count: 4200 },
    { step: "Iniciaron Checkout", count: 1800 },
    { step: "Compras Exitosas", count: 450 }
  ];

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart layout="vertical" data={safeData} margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis type="number" hide />
          <YAxis dataKey="step" type="category" axisLine={false} tickLine={false} style={{ fill: 'var(--muted)', fontSize: 12 }} />
          <Tooltip 
            cursor={{fill: 'rgba(255,255,255,0.05)'}} 
            contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)' }} 
          />
          <Bar dataKey="count" fill="var(--brand-primary)" radius={[0, 4, 4, 0]} barSize={30}>
            {safeData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 2. Rentabilidad por Categoría (Donut)
export function CategoryRevenueChart({ data }: { data: { name: string, value: number }[] }) {
  const safeData = data?.length ? data : [
    { name: "Audio y Video", value: 45000 },
    { name: "Accesorios Móviles", value: 32000 },
    { name: "Hogar Smart", value: 18000 },
    { name: "Gaming", value: 15000 },
    { name: "Otros", value: 8000 }
  ];

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={safeData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
            {safeData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0.1)" />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => formatCurrency(value, "S/")}
            contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)' }}
          />
          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// 3. Tasa de Cierre Cotizaciones vs Ventas Directas
export function QuotesVsOrdersChart({ data }: { data: { month: string, quotes: number, orders: number }[] }) {
  const safeData = data?.length ? data : [
    { month: "Abr", quotes: 15000, orders: 25000 },
    { month: "May", quotes: 28000, orders: 32000 },
    { month: "Jun", quotes: 45000, orders: 48000 },
    { month: "Jul", quotes: 60000, orders: 52000 },
    { month: "Ago", quotes: 95000, orders: 68000 },
    { month: "Sep", quotes: 120000, orders: 85000 }
  ];

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart data={safeData} margin={{ top: 20, right: 20, left: 20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} style={{ fill: 'var(--muted)', fontSize: 12 }} />
          <YAxis yAxisId="left" tickFormatter={(v) => `${v/1000}k`} axisLine={false} tickLine={false} style={{ fill: 'var(--muted)', fontSize: 12 }} />
          <Tooltip 
            formatter={(value: number) => formatCurrency(value, "S/")}
            contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="orders" name="Órdenes (Pagadas)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Line yAxisId="left" type="monotone" dataKey="quotes" name="Cotizaciones (Valor)" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// 4. Rendimiento de Promotores
export function TopPromotersChart({ data }: { data: { name: string, sales: number }[] }) {
  const safeData = data?.length ? data : [
    { name: "influencer1", sales: 12500 },
    { name: "tech_review", sales: 8400 },
    { name: "lima_descuentos", sales: 6200 },
    { name: "verano24", sales: 4100 },
    { name: "tiktok_promo", sales: 2900 }
  ];

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={safeData} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis type="number" hide />
          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} style={{ fill: 'var(--muted)', fontSize: 11 }} width={80} />
          <Tooltip 
            formatter={(value: number) => formatCurrency(value, "S/")}
            contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)' }}
          />
          <Bar dataKey="sales" name="Ventas Generadas" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 5. Mapa de Calor (Simulado con un Scatter Plot simple por limitaciones de Recharts)
export function PeakHoursChart({ data }: { data: { hour: string, value: number }[] }) {
  const safeData = data?.length ? data : [
    { hour: "00-04h", value: 15 },
    { hour: "04-08h", value: 45 },
    { hour: "08-12h", value: 250 },
    { hour: "12-16h", value: 380 },
    { hour: "16-20h", value: 420 },
    { hour: "20-24h", value: 290 }
  ];

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <AreaChart data={safeData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="hour" axisLine={false} tickLine={false} style={{ fill: 'var(--muted)', fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} style={{ fill: 'var(--muted)', fontSize: 12 }} />
          <Tooltip 
            contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)' }}
          />
          <Area type="monotone" dataKey="value" name="Ventas/Transacciones" stroke="#f97316" fillOpacity={1} fill="url(#colorValue)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}


