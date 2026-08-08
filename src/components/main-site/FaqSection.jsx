import React from "react";
import teamImage from "../../assets/main-site/people5.svg";

export default function Str6() {
  return (
    <section className="str6">
      <div className="str6__container">
        <div className="str6__card">
          {/* LEFT */}
          <div className="str6__media">
            <img className="str6__img" src={teamImage} alt="Team" />

            <div className="str6__badge" aria-label="500+ довольных клиентов">
              <div className="str6__badgeNumber">500+</div>
              <div className="str6__badgeText">Довольных клиентов</div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="str6__content">
            <h2 className="str6__title">
              Команда профессионалов <br />
              на вашей стороне 24/7
            </h2>

            <p className="str6__desc">
              Мы не просто агентство/сервис/подписка — мы ваша команда. Юристы,
              маркетологи, дизайнеры и специалисты по репутации работают над вашим
              успехом!
            </p>

            <div className="str6__stats">
              <div className="str6__stat">
                <span className="str6__statNumber">5+</span>
                <span className="str6__statLabel">Лет опыта</span>
              </div>

              <div className="str6__stat">
                <span className="str6__statNumber">38</span>
                <span className="str6__statLabel">Человек в нашей команде</span>
              </div>

              <div className="str6__stat">
                <span className="str6__statNumber">24/7</span>
                <span className="str6__statLabel">Поддержка</span>
              </div>

              <div className="str6__stat">
                <span className="str6__statNumber">10к+</span>
                <span className="str6__statLabel">Отзывов</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}