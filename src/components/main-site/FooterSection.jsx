import React from "react";

import iCafe from "../../assets/main-site/cafe.svg";
import iMed from "../../assets/main-site/med.svg";
import iBeauty from "../../assets/main-site/beauty.svg";
import iEdu from "../../assets/main-site/edu.svg";

import iFitness from "../../assets/main-site/fitnes.svg";
import iEstate from "../../assets/main-site/estate.svg";
import iAuto from "../../assets/main-site/auto.svg";
import iRetail from "../../assets/main-site/retail.svg";

import iLaw from "../../assets/main-site/law.svg";
import iWellness from "../../assets/main-site/wellness.svg";
import iB2B from "../../assets/main-site/b2b.svg";
import iIT from "../../assets/main-site/it.svg";

import iTravel from "../../assets/main-site/travel.svg";
import iGames from "../../assets/main-site/games.svg";
import iBlog from "../../assets/main-site/blog.svg";

const items = [
  { title: "Рестораны и кафе", icon: iCafe },
  { title: "Медицина", icon: iMed },
  { title: "Салоны красоты", icon: iBeauty },
  { title: "Образование", icon: iEdu },

  { title: "Фитнес", icon: iFitness },
  { title: "Недвижимость", icon: iEstate },
  { title: "Автосервисы", icon: iAuto },
  { title: "Ритейл", icon: iRetail },

  { title: "Юридические услуги", icon: iLaw },
  { title: "Wellness", icon: iWellness },
  { title: "B2B сервисы", icon: iB2B },
  { title: "IT и Digital", icon: iIT },

  { title: "Туризм", icon: iTravel },
  { title: "Игровые серверы", icon: iGames },
  { title: "Личный блог", icon: iBlog },
];

export default function Str8() {
  return (
    <section className="str8">
      <div className="str8__container">
        <div className="str8__badge">Отрасли</div>

        <h2 className="str8__title">Работаем с любым типом бизнеса</h2>
        <p className="str8__subtitle">У нас есть опыт и эксперты в любой сфере</p>

        <div className="str8__grid">
          {items.map((it) => (
            <div className="str8__card" key={it.title}>
              <div className="str8__icon">
                <img src={it.icon} alt="" />
              </div>
              <div className="str8__label">{it.title}</div>
            </div>
          ))}
        </div>

        <div className="str8__note">
          <div className="str8__noteTitle">Не нашли свою сферу?</div>
          <div className="str8__noteText">
            Просто <span className="str8__noteAccent">начинайте</span> с пакетом или в конструкторе,
            а мы сразу подхватим!
          </div>
        </div>
      </div>
    </section>
  );
}