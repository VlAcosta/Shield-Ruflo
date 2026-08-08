import React from "react";

const advantages = [
  {
    title: "Поддержка 24/7",
    desc: "Наша команда всегда на связи, выходные и праздники – не исключение",
  },
  {
    title: "Юридическая защита",
    desc: "В штате профессиональные юристы для оспоривания вашего имиджа и не только они...",
  },
  {
    title: "Мноооого инструментов",
    desc: "Всё в одном месте – удобно?",
  },
  {
    title: "Мобильное приложение",
    desc: "Удобно, правда ли? Больше не нужно везде носить ноутбук.",
  },
  {
    title: "Реферальная система",
    desc: "Всегда приятно разделить с товарищем скидку за подписку!",
  },
  {
    title: "Фиксируем",
    desc: "Никаких дополнительных вложений, одна подписка – один чек на месяц",
  },
];

const stats = [
  { num: "500+", label: "Клиентов" },
  { num: "10к+", label: "Отзывов обработано" },
  { num: "98%", label: "Положительных" },
  { num: "2ч", label: "Ср. время реакции" },
];

export default function Str4() {
  return (
    <section className="str4">
      <div className="str4__container">
        <div className="str4__badge">Наши преимущества</div>

        <h2 className="str4__title">Почему выбирают нас?</h2>
        <p className="str4__subtitle">
          Мы не просто исполнители – мы ваши партнёры в построении репутации
        </p>

        <div className="str4__grid">
          {advantages.map((a, i) => (
            <article className="str4__card" key={i}>
              <h3 className="str4__cardTitle">{a.title}</h3>
              <p className="str4__cardText">{a.desc}</p>
            </article>
          ))}
        </div>

        <div className="str4__stats">
          {stats.map((s, i) => (
            <div className="str4__stat" key={i}>
              <div className="str4__statNum">{s.num}</div>
              <div className="str4__statLabel">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}