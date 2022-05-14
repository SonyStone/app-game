let data: any | undefined;
const allPorts: any[] = [];

self.addEventListener('connect', (e) => {
  const port: MessagePort = (e as any).ports[0];
  allPorts.push(port);

  if (data) {
    port.postMessage(data);
  }

  port.addEventListener('message', (e) => {
    data = e.data;
    allPorts.forEach((allPort) => {
      allPort.postMessage(data);
    });
  });

  port.start();
});
