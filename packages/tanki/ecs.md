Требования к ecs

Так как в JavaScript нету возможности на прямую работать с памятью, структуры данных в ECS будут отличаться.

- `World` -- объект, в котором храняться отношения между Entites, Components и Systems.
- `Entitу` -- это объект или класс
- `Component` -- это поля объекта Entitу.
- `System` это функиция, которая в параметрах получает Entitу или Array of Entites.

Совокупность всех `Entites` и их `Components` в объекте `World` это состояние -- `State`.

`System` имеет доступ к `Entitу` -- читать, обновлять, добавлять или удолять поля (`Read`, `Update`, `Create`, `Delete`)

`Systems` сохраняються в список. У каждой системы есть свой список с `Entites`
`World` имеет метод run, каторый запускает все системы по очереди, обновляя общий `State`

Ecs это разбиение приложения на структуры -- объекты Entites, в каторых
