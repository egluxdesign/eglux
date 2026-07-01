import React from 'react';

const statsData = [
  { value: '2015', label: 'Tahun Berdiri' },
  { value: '500+', label: 'Staff Profesional' },
  { value: '40K+', label: 'm² Area Pabrik' },
  { value: '1M+', label: 'Pelanggan Puas' }
];

const StatsSection = () => {
  return (
    <section className="stats-section">
      <div className="container">
        <div className="stats-grid">
          {statsData.map((stat, index) => (
            <div className="stat-item" key={index}>
              <h3>{stat.value}</h3>
              <p>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;