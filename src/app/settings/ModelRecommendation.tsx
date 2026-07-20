interface ModelRecommendationProps {
  subject: string;
  tier: string;
  description: string;
  examples: readonly [string, string, string];
}

export function ModelRecommendation({ subject, tier, description, examples }: ModelRecommendationProps) {
  return (
    <aside className="model-recommendation" aria-label={`${subject}模型建议`}>
      <div className="model-recommendation-heading">
        <span>模型建议</span>
        <strong>{tier}</strong>
      </div>
      <p>{description}</p>
      <div className="model-recommendation-examples" aria-label={`${subject}模型示例`}>
        <span>同档示例 · 2026-07</span>
        <ul>
          {examples.map((example) => (
            <li key={example}>{example}</li>
          ))}
        </ul>
      </div>
      <small>仅作能力基准；能否直接调用，以你的 API 服务商实际返回的模型列表为准。</small>
    </aside>
  );
}
