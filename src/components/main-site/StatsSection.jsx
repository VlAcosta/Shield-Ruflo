import React from "react";

import iconStar from "../../assets/main-site/stars_situation.svg";
import faceBroken from "../../assets/main-site/broken-heart.svg";

import iconChart from "../../assets/main-site/height_situation.svg";
import faceWorried from "../../assets/main-site/worried 1.svg";

import iconSmi from "../../assets/main-site/smi_situation.svg";
import faceSuspect from "../../assets/main-site/suspect 1.svg";

const cards = [
  {
    icon: iconStar,
    face: faceBroken,
    text: "Открыть Яндекс.карты или WB и\nувидеть одну звезду без ответа?",
  },
  {
    icon: iconChart,
    face: faceWorried,
    text: "Потерять клиента, который\nпрочитал негатив и ушёл к\nконкуренту?",
  },
  {
    icon: iconSmi,
    face: faceSuspect,
    text: "Узнать,что о вас пишут\nСМИ когда уже поздно?",
  },
];

export default function Str2() {
  return (
    <section className="str2">
      <div className="str2__container">
        <div className="str2__badge">Знакомая ситуация?</div>

        <h2 className="str2__title">Чего вы боитесь?</h2>
        <p className="str2__subtitle">Эти проблемы мешают вашему бизнесу расти</p>

        <div className="str2__cards">
          {cards.map((c, i) => (
            <article className="str2__card" key={i}>
              <div className="str2__top">
                <div className="str2__iconBox">
                  <img className="str2__icon" src={c.icon} alt="" />
                </div>
                <img className="str2__face" src={c.face} alt="" />
              </div>

              <p className="str2__text">{c.text}</p>
            </article>
          ))}
        </div>

        <div className="str2__cta">
          <div className="str2__ctaTitle">Мы - ваш щит.</div>
          <div className="str2__ctaText">Больше никаких страхов - только рост</div>
        </div>
      </div>
    </section>
  );
}