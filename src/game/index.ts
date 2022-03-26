class Store {
  entities = [
    {
      props: {
        position: { x: 3, y: 3 },
        shape: 'box',
      },
    },
    {
      props: {
        position: { x: 3, y: 3 },
        shape: 'box',
      },
    },
  ];

  run() {
    for (const id in this.entities) {
      const entity = this.entities[id];
      entity.props.position;
    }
  }
}

// const Renderable = { ...Position, ...Shape }
