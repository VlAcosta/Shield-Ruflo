import React from "react";

import caseImg1 from "../../assets/main-site/photo6_1.svg"; 
import caseImg2 from "../../assets/main-site/phote6_2.svg";

function Str7() {
  return (
    <section className="str7">
      <div className="str7__container">
        <div className="str7__badge">Кейсы</div>

        <h2 className="str7__title">
          Реальные результаты.
          <br />
          Проверенные методы.
        </h2>
        <p className="str7__subtitle">Одни из примеров нашей работы</p>

        <article className="str7__case">
          <div className="str7__media">
            <img className="str7__img" src={caseImg1} alt="Кейс рестораны" />
          </div>

          <div className="str7__content">
            <h3 className="str7__caseTitle">
              Как мы подняли рейтинг сети
              <br />
              ресторанов с 3.2 до 4.9
            </h3>

            <div className="str7__block">
              <div className="str7__blockHead">
                <span className="str7__dot str7__dot--red" />
                <span className="str7__blockLabel">Проблема:</span>
              </div>
              <p className="str7__blockText">
                Сеть из 5-ти ресторанов теряла клиентов из-за низких оценок и
                негативных отзывов без ответов
              </p>
            </div>

            <div className="str7__block">
              <div className="str7__blockHead">
                <span className="str7__dot str7__dot--green" />
                <span className="str7__blockLabel">Решение:</span>
              </div>
              <p className="str7__blockText">
                Внедрили систему мониторинга, обучили персонал работе с отзывами,
                запустили программу лояльности с QR-кодами
              </p>
            </div>

            <div className="str7__kpis">
              <div className="str7__kpi str7__kpi--orange">
                <div className="str7__kpiVal">+1.7</div>
                <div className="str7__kpiLbl">Рост рейтинга</div>
              </div>
              <div className="str7__kpi str7__kpi--orange">
                <div className="str7__kpiVal">+450%</div>
                <div className="str7__kpiLbl">Отзывов</div>
              </div>
              <div className="str7__kpi str7__kpi--orange">
                <div className="str7__kpiVal">+35%</div>
                <div className="str7__kpiLbl">Новых клиентов</div>
              </div>
            </div>
          </div>
        </article>

        <article className="str7__case str7__case--reverse">
          <div className="str7__media">
            <img className="str7__img" src={caseImg2} alt="Кейс автосервис" />
          </div>

          <div className="str7__content">
            <h3 className="str7__caseTitle">
              Защита репутации автосервиса от
              <br />
              недобросовестных конкурентов
            </h3>

            <div className="str7__block">
              <div className="str7__blockHead">
                <span className="str7__dot str7__dot--red" />
                <span className="str7__blockLabel">Проблема:</span>
              </div>
              <p className="str7__blockText">
                Массовая атака фейковыми негативными отзывами угрожала потери
                доверия от клиентов
              </p>
            </div>

            <div className="str7__block">
              <div className="str7__blockHead">
                <span className="str7__dot str7__dot--green" />
                <span className="str7__blockLabel">Решение:</span>
              </div>
              <p className="str7__blockText">
                Юридически оспорили отзывы, работа с площадками, PR-кампания с
                реальными клиентами
              </p>
            </div>

            <div className="str7__kpis">
              <div className="str7__kpi str7__kpi--blue">
                <div className="str7__kpiVal">100%</div>
                <div className="str7__kpiLbl">Удалённых фейков</div>
              </div>
              <div className="str7__kpi str7__kpi--blue">
                <div className="str7__kpiVal">4.9</div>
                <div className="str7__kpiLbl">Итоговый рейтинг</div>
              </div>
              <div className="str7__kpi str7__kpi--blue">
                <div className="str7__kpiVal">+200%</div>
                <div className="str7__kpiLbl">Рост доверия</div>
              </div>
            </div>
          </div>
        </article>

        <div className="str7__cta">
          <h3 className="str7__ctaTitle">Хотите стать нашим следующим кейсом?</h3>
          <p className="str7__ctaDesc">
            Мы готовы создать индивидуальную стратегию для вашего бизнеса.
          </p>
          <button className="str7__ctaBtn" type="button">
            Получить бесплатный аудит
          </button>
        </div>
      </div>
    </section>
  );
}

export default Str7;