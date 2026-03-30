function buildPowerWashingReply(intent, message = "") {
  const squareFootage = extractSquareFootage(message);
  const concern = summarizePowerWashingConcern(message);
  const actions = buildPowerWashingButtons();

  if (intent === "powerwash-pricing" && squareFootage) {
    const basePrice = Math.max(squareFootage * powerWashingRate, powerWashingMinimum);
    const totalWithHst = basePrice * (1 + hstRate);

    return {
      reply:
        `Based on the ${squareFootage} sq ft you mentioned, the rough price is ${formatCurrency(basePrice)} plus HST, or about ${formatCurrency(totalWithHst)} total. Final pricing can vary slightly depending on buildup, staining, and the type of material.\n\n` +
        `For more details, you can take a look here: [action:View Power Washing Details]\n\n` +
        `If you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,
      actions
    };
  }

  const responses = {
    "powerwash-inquiry":
      `Power washing is usually worth it when the main concern is ${concern}. It improves appearance, helps with slippery buildup, and protects the surface when it is cleaned properly.\n\n` +
      `For more details, you can take a look here: [action:View Power Washing Details]\n\n` +
      `If you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,

    "powerwash-pricing":
      `I can give you a rough estimate once I know the approximate square footage. Pricing is ${formatCurrency(powerWashingRate)}/sq ft with a ${formatCurrency(powerWashingMinimum)} minimum, plus HST.\n\n` +
      `For more details, you can take a look here: [action:View Power Washing Details]\n\n` +
      `If you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,

    "powerwash-objection":
      `Lower prices are out there, but the main difference is whether the surface is cleaned properly without damage. My pricing is ${formatCurrency(powerWashingRate)}/sq ft with a ${formatCurrency(powerWashingMinimum)} minimum, plus HST, and the goal is a proper result rather than a quick rinse.\n\n` +
      `For more details, you can take a look here: [action:View Power Washing Details]\n\n` +
      `If you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,

    "powerwash-sealing":
      `My focus is on cleaning the surface properly first, because that is where most of the visible improvement comes from. In many cases, once the surface is fully cleaned, sealing is not necessary right away.\n\n` +
      `For more details, you can take a look here: [action:View Power Washing Details]\n\n` +
      `If you'd like a more precise recommendation, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,

    "powerwash-sealing-repeat":
      `Sealing can have its place, but the first priority is getting the surface properly cleaned. Without that step, sealing will not perform the way it should.\n\n` +
      `For more details, you can take a look here: [action:View Power Washing Details]\n\n` +
      `If you'd like a more precise recommendation, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,

    "powerwash-booking":
      `Most projects can be quoted without a site visit.\n\n` +
      `For more details, you can take a look here: [action:View Power Washing Details]\n\n` +
      `If you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,

    "powerwash-trust":
      `I like to be clear about expectations before anything starts. Most surfaces respond very well to a proper cleaning, but heavier spots like oil, algae, or mortar need to be assessed honestly.\n\n` +
      `For more details, you can take a look here: [action:View Power Washing Details]\n\n` +
      `If you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,

    "powerwash-delay":
      `That works.\n\n` +
      `For more details, you can take a look here: [action:View Power Washing Details]\n\n` +
      `When you're ready, you can [action:Send Photos by Email] or [action:Text (647) 272-7171] for a more precise quote.`
  };

  return {
    reply: responses[intent] || responses["powerwash-inquiry"],
    actions
  };
}

function buildPowerWashingButtons() {
  return [
    { type: "link", label: "View Power Washing Details", url: powerWashingPageUrl },
    { type: "email", label: "Send Photos by Email", url: `mailto:${businessEmail}` },
    { type: "sms", label: "Text (647) 272-7171", url: "sms:6472727171" }
  ];
}
