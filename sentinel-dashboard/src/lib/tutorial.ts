export type TutorialTermId =
  | "type"
  | "impact"
  | "senti"
  | "conf"
  | "pos"
  | "cont"
  | "arb"
  | "cons"
  | "thr";

export type TutorialTerm = {
  id: TutorialTermId;
  title: string;
  swatch: string;
  swatchLabel?: string;
  subtitle?: string;
  paragraphs: string[];
  scale?: boolean;
};

export const TUTORIAL_TERMS: TutorialTerm[] = [
  {
    id: "type",
    title: "Type d'événement",
    swatch: "#4A63A8",
    swatchLabel: "Aa",
    paragraphs: [
      "La catégorie attribuée par l'agent IA à chaque cluster de news : résultats, guidance, M&A, réglementaire, juridique, produit, direction, notation, macro ou rumeur. Les chips en haut du fil filtrent le fil par cette catégorie.",
      "Réglementaire = action d'un régulateur (enquête, sanction, autorisation). Guidance = révision des prévisions financières communiquées par l'entreprise elle-même.",
    ],
  },
  {
    id: "impact",
    title: "Impact",
    subtitle: "0 → 100",
    swatch: "var(--signal)",
    swatchLabel: "79",
    scale: true,
    paragraphs: [
      "L'ampleur attendue sur la valorisation du titre — jamais l'intérêt médiatique. Un article « 5 raisons d'acheter » fait du clic mais score proche de 0. Une divergence résultats/guidance sur une ligne volatile score haut même avec une seule source.",
    ],
  },
  {
    id: "senti",
    title: "Sentiment",
    subtitle: "−1,0 → +1,0",
    swatch: "#3A4568",
    swatchLabel: "±",
    paragraphs: [
      "La tonalité de l'information elle-même, indépendante de l'impact. Une news peut être légèrement négative (−0,12) mais avoir un impact élevé, si le marché réagit fort à un signal mitigé.",
      "Sentiment = de quoi ça parle. Impact = à quel point ça va bouger le cours.",
    ],
  },
  {
    id: "conf",
    title: "Confiance",
    swatch: "#2C5F5A",
    swatchLabel: "91%",
    paragraphs: [
      "La confiance du système dans sa propre analyse — pas dans le titre. Dépend de l'autorité des sources et de leur nombre. Règle imposée à l'agent : une source unique de type blog ou forum plafonne la confiance à 40 %.",
      "Confiance basse = « je te montre l'info, mais vérifie avant d'agir ».",
    ],
  },
  {
    id: "pos",
    title: "Ta position",
    swatch: "#5A4A8A",
    swatchLabel: "20%",
    paragraphs: [
      "Le poids de la ligne dans ton portefeuille, tel que réglé dans l'onglet Portefeuille. Il contextualise l'impact : un même événement compte plus sur une ligne à 20 % que sur une ligne à 5 %.",
    ],
  },
  {
    id: "cont",
    title: "Contagion",
    swatch: "#7A5A2C",
    swatchLabel: "↝",
    paragraphs: [
      "Détection d'un effet indirect sur une autre ligne de ton portefeuille que celle citée dans la news. Exemple : la guidance ASML relevée signale NVDA en contagion, car la demande en machines EUV est un indicateur avancé de la demande de puces.",
    ],
  },
  {
    id: "arb",
    title: "Arbitrage suggéré",
    swatch: "#2C5F5A",
    swatchLabel: "⇄",
    paragraphs: [
      "Une lecture de ce que l'événement implique pour ta position. Touche une carte pour dérouler la chaîne de raisonnement en trois temps : l'événement, le mécanisme économique, l'effet sur ta ligne.",
      "Renforcement · Maintien · Prise de bénéfices · Allègement. La confiance en trois barres reflète la solidité du lien de causalité.",
    ],
  },
  {
    id: "cons",
    title: "Consensus analystes",
    swatch: "#4A63A8",
    swatchLabel: "◫",
    paragraphs: [
      "La répartition des recommandations des bureaux qui couvrent le titre, et leur objectif de cours moyen comparé au cours actuel. Contrepoids si une suggestion va contre un consensus large.",
      "Non disponible dans cette version — les arbitrages s'appuient uniquement sur les events captés et le scoring LLM.",
    ],
  },
  {
    id: "thr",
    title: "Seuil d'alerte",
    subtitle: "onglet Portefeuille",
    swatch: "#5A6478",
    swatchLabel: "80",
    paragraphs: [
      "Le curseur qui fixe, ligne par ligne, à partir de quel score d'impact une notification t'est envoyée. En dessous, l'événement reste visible dans le fil mais sans notification.",
      "L'estimation « ≈2/sem » est une projection à partir de la fréquence historique des scores sur cette ligne.",
    ],
  },
];
