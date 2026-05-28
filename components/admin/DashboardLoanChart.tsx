"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  day:       number;
  thisMonth: number;
  lastMonth: number;
}

interface Props {
  data:           DataPoint[];
  thisMonthLabel: string;
  lastMonthLabel: string;
  dayLabel:       string;
}

export default function DashboardLoanChart({
  data,
  thisMonthLabel,
  lastMonthLabel,
  dayLabel,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ top: 5, right: 16, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          interval={4}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={32}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / .06)",
          }}
          labelFormatter={(v) => `${dayLabel} ${v}`}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="circle"
          iconSize={7}
        />
        <Line
          type="monotone"
          dataKey="thisMonth"
          name={thisMonthLabel}
          stroke="#6366f1"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: "#6366f1" }}
        />
        <Line
          type="monotone"
          dataKey="lastMonth"
          name={lastMonthLabel}
          stroke="#d1d5db"
          strokeWidth={2}
          dot={false}
          strokeDasharray="5 3"
          activeDot={{ r: 4, fill: "#9ca3af" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
