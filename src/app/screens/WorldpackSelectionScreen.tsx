import { useState, type CSSProperties } from 'react';
import hongKong1988Image from '../../assets/storypack/1988.webp';

type WorldpackId =
  | 'hong-kong-1988'
  | 'san-delaro-2023'
  | 'kyozaki-1999'
  | 'shanghai-1943';

interface WorldpackCardDefinition {
  id: WorldpackId;
  title: string;
  englishTitle: string;
  era: string;
  setting: string;
  description: string;
  image?: string;
  accent: string;
  glow: string;
  isAvailable: boolean;
}

const worldpacks: WorldpackCardDefinition[] = [
  {
    id: 'hong-kong-1988',
    title: '香港 1988',
    englishTitle: 'HONG KONG',
    era: '1980—1996',
    setting: '真实香港 · 已开放',
    description:
      '港英时代末期的开放社会人生。以警察、市民或社团身份，穿行于案件、金钱、人情、媒体与家庭压力之间。',
    image: hongKong1988Image,
    accent: '#e7a443',
    glow: 'rgba(235, 91, 32, 0.34)',
    isAvailable: true
  },
  {
    id: 'san-delaro-2023',
    title: '圣·德拉罗',
    englishTitle: 'SAN DELARO',
    era: '2023',
    setting: '虚构美国大都会 · 预研中',
    description:
      '金融城区、娱乐名利场、科技走廊、海湾夜生活与辽阔县域交织。巡逻、查案、网络舆论和地方政治共同塑造近乎无限的选择。',
    accent: '#49d4e6',
    glow: 'rgba(39, 207, 233, 0.32)',
    isAvailable: false
  },
  {
    id: 'kyozaki-1999',
    title: '京崎 1999',
    englishTitle: 'KYOZAKI',
    era: '1986—1999',
    setting: '虚构日本大都市 · 预研中',
    description:
      '从泡沫顶峰走向失去的十年。企业、银行、官僚与黑帮共生，组织忠诚、家族责任、个人欲望与现实生存彼此拉扯。',
    accent: '#d96446',
    glow: 'rgba(210, 65, 44, 0.3)',
    isAvailable: false
  },
  {
    id: 'shanghai-1943',
    title: '上海 1943',
    englishTitle: 'SHANGHAI',
    era: '1930s—1940s',
    setting: '真实历史舞台 · 预研中',
    description:
      '租界、华界、帮会与战争占领下的上海。繁华、黑市、情报、合作与抵抗并存，每次抉择都牵动家庭、道德与家国。',
    accent: '#c59a58',
    glow: 'rgba(203, 139, 52, 0.3)',
    isAvailable: false
  }
];

interface WorldpackSelectionScreenProps {
  onBack: () => void;
  onSelectHongKong: () => void;
}

export function WorldpackSelectionScreen({
  onBack,
  onSelectHongKong
}: WorldpackSelectionScreenProps) {
  const [notice, setNotice] = useState<string | null>(null);

  function handleSelect(worldpack: WorldpackCardDefinition) {
    if (worldpack.isAvailable) {
      onSelectHongKong();
      return;
    }

    setNotice(`${worldpack.title}仍在预研阶段，专用开局向导将在世界包完成后开放。`);
  }

  return (
    <main className="worldpack-selection-screen">
      <div className="worldpack-selection-atmosphere" aria-hidden="true" />
      <header className="worldpack-selection-header">
        <button type="button" className="worldpack-back-button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          返回首页
        </button>
        <div className="worldpack-selection-heading">
          <p className="worldpack-selection-kicker">SELECT A WORLDPACK</p>
          <h1>选择世界包</h1>
          <p>每一座城市，都有自己的时代、秩序与代价。</p>
        </div>
        <div className="worldpack-header-balance" aria-hidden="true" />
      </header>

      <section className="worldpack-selection-grid" aria-label="世界包列表">
        {worldpacks.map((worldpack, index) => {
          const cardStyle = {
            '--worldpack-accent': worldpack.accent,
            '--worldpack-glow': worldpack.glow,
            '--worldpack-index': index
          } as CSSProperties;
          const actionLabel = worldpack.isAvailable ? '进入开局向导' : '专用向导 · 预研中';

          return (
            <button
              key={worldpack.id}
              type="button"
              className="worldpack-selection-card"
              style={cardStyle}
              data-worldpack-id={worldpack.id}
              data-available={worldpack.isAvailable ? 'true' : 'false'}
              aria-label={
                worldpack.isAvailable
                  ? `选择${worldpack.title}世界包`
                  : `查看${worldpack.title}世界包预研状态`
              }
              onClick={() => handleSelect(worldpack)}
            >
              <span className="worldpack-card-frame">
                <span className="worldpack-card-art">
                  {worldpack.image ? (
                    <img src={worldpack.image} alt="" draggable={false} />
                  ) : null}
                  <span className="worldpack-card-art-shade" aria-hidden="true" />
                  <span className="worldpack-card-era">{worldpack.era}</span>
                </span>
                <span className="worldpack-card-copy">
                  <span className="worldpack-card-title-row">
                    <span>
                      <span className="worldpack-card-title">{worldpack.title}</span>
                      <span className="worldpack-card-english">{worldpack.englishTitle}</span>
                    </span>
                    <span
                      className={`worldpack-card-state ${
                        worldpack.isAvailable ? 'is-available' : ''
                      }`}
                    >
                      {worldpack.isAvailable ? '已开放' : '预研中'}
                    </span>
                  </span>
                  <span className="worldpack-card-setting">{worldpack.setting}</span>
                  <span className="worldpack-card-description">{worldpack.description}</span>
                  <span className="worldpack-card-action">
                    {actionLabel}
                    <span aria-hidden="true">{worldpack.isAvailable ? '→' : '◇'}</span>
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </section>

      <div className="worldpack-selection-footer">
        <p className="worldpack-selection-availability">
          当前可游玩：<strong>香港 1988</strong>
        </p>
        <p className="worldpack-selection-notice" role="status" aria-live="polite">
          {notice ?? '其余世界包处于前期研究阶段，卡面与设定不代表最终成品。'}
        </p>
      </div>
    </main>
  );
}
