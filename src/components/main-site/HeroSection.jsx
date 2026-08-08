import React from "react"
import shitLogo from '../../assets/main-site/shit.svg';
import stars1 from '../../assets/main-site/stars1.svg';
import stars from '../../assets/main-site/stars.svg';
import load from '../../assets/main-site/load.svg';
import height from '../../assets/main-site/height.svg';
import monitoring from '../../assets/main-site/monitoring.svg';
import burger from '../../assets/main-site/burger.svg';
import '../../scss/main.scss'

import { useNavigate } from "react-router-dom";

export default function HeroSection() {
  const navigate = useNavigate();

    return (
        <div className="main_block">
            <div className="header_block">
                <div className="logo">
                    <img id="logo_img" src={shitLogo} alt="Щит" />
                    <span id="logo_text">Бизнес Щит</span>
                </div>
                <div className="section-span">
                    <img id="burger" src={burger} alt="Бургер" />
                    <span id="function">Функции</span>
                    <span id="tarif">Тарифы</span>
                    <span id="about">О нас</span>
                    <span id="contacts">Контакты</span>
                </div>
            </div>
            <div className="block_1">
                <div className="but_main">
                    <img src={stars1} alt="Звёзды" id="but_stars" />
                    <h1 id="but_text">Защита репутации 24/7</h1>
                </div>
                <div className="name_log">
                    <img src={shitLogo} alt="Щит" id="logoShit" />
                    <span id="main_text">Бизнес Щит</span>
                </div>
                <div className="description">
                    <span id="description_text">Ваша репутация в надёжных руках.</span>
                    <span id="description_text_2">Мы следим за каждым отзывом,строим позитивный имидж и защищаем вашу репутацию,пока вы работаете</span>
                </div>
                <div className="button_block">
                    <button id="mobile_start_but">Начать защиту</button>
                    <div className="buttons">
                        <button id="start-but" onClick={() => navigate("/pricing")}>Старт</button>
                        <button id="info-but">Как это работает?</button>
                    </div>
                    <div className="texts">
                        <div className="online-text">
                            <div id="eclipse_online"></div>
                            <span id="online">Работает прямо сейчас</span>
                        </div>
                        <span id="texts-2">500+ довольных клиентов</span>
                    </div>
                </div>
                <div className="block_2">
                    <div className="block_comments">
                        <img src={stars} alt="Звезда" id="stars" />
                        <span id="com_main_text">98%</span>
                        <span id="desc_text">Положительных отзывов</span>
                    </div>
                    <div className="block_comments_process">
                        <img src={load} alt="Загрузка" id="load" />
                        <span id="load_main_text">10к + </span>
                        <span id="desc_text">Отзыввов обработано</span>
                    </div>
                    <div className="block_reputation">
                        <img src={height} alt="Рост" id="reputation" />
                        <span id="reput_main_text">350%</span>
                        <span id="desc_text">Рост репутации</span>
                    </div>
                    <div className="block_monitoring">
                        <img src={monitoring} alt="Мониторинг" id="monitoring" />
                        <span id="monit_main_text">24/7</span>
                        <span id="desc_text">Мониоринг</span>
                    </div>
                </div>
            </div>
        </div>
    )
}


