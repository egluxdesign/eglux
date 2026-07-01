import React from 'react';

const timelineData = [
  {
    year: '2015',
    title: 'Awal Mula Eglux',
    description: 'Eglux didirikan dengan visi menciptakan produk rumah tangga yang fungsional dan estetis.'
  },
  {
    year: '2017',
    title: 'Ekspansi Produk',
    description: 'Meluncurkan lini produk kitchen dan home decor pertama yang mendapat sambutan positif.'
  },
  {
    year: '2019',
    title: 'Pabrik Modern',
    description: 'Membangun pabrik seluas 40.000 m² dengan teknologi manufaktur terkini.'
  },
  {
    year: '2021',
    title: 'Go Digital',
    description: 'Memperluas reach melalui platform e-commerce dan media sosial.'
  },
  {
    year: '2023',
    title: '500+ Staff Profesional',
    description: 'Tim berkembang pesat dengan divisi R&D dan desain yang berdedikasi.'
  },
  {
    year: '2025',
    title: 'Menuju Masa Depan',
    description: 'Terus berinovasi untuk menghadirkan solusi hunian modern bagi keluarga Indonesia.'
  }
];

const TimeLineSection = () => {
  return (
    <section className="timeline-section">
      <div className="container">
        <div className="section-header">
          <h2>Perjalanan Eglux</h2>
          <p>Dari awal yang sederhana hingga menjadi brand rumah tangga terpercaya</p>
        </div>
        <div className="timeline">
          {timelineData.map((item, index) => (
            <div className="timeline-item" key={index}>
              <div className="timeline-dot" />
              <div className="timeline-content">
                <div className="timeline-year">{item.year}</div>
                <h4>{item.title}</h4>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TimeLineSection;