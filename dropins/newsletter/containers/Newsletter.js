import { subscribe } from '../api/subscribe.js';

export function Newsletter() {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = `
        <input type="email" id="email" placeholder="your email address">
        <button type="button">Subscribe Now</button>
        <p class="message"></p>
    `;

    const button = wrapper.querySelector('button');

    button.addEventListener('click', async () => {
        const email = wrapper.querySelector('#email').value;

        const result = await subscribe(email);

        wrapper.querySelector('.message').textContent = result.message;
    });

    return wrapper;
}