export interface Translations {
	commands: {
		'import-single-post': string;
		'import-blog-url': string;
		'sync-subscribed-blogs': string;
		'ai-fix-layout': string;
	};
	settings: {
		title: string;
		ai_configuration: string;
		ai_provider: string;
		ai_provider_desc: string;
		ai_model: string;
		ai_model_desc: string;
		openai_api_key: string;
		openai_api_key_desc: string;
		anthropic_api_key: string;
		anthropic_api_key_desc: string;
		google_api_key: string;
		google_api_key_desc: string;
		ollama_endpoint: string;
		ollama_endpoint_desc: string;
		default_folder: string;
		default_folder_desc: string;
		image_folder: string;
		image_folder_desc: string;
		enable_ai_tags: string;
		enable_ai_tags_desc: string;
		enable_ai_excerpt: string;
		enable_ai_excerpt_desc: string;
		enable_duplicate_check: string;
		enable_duplicate_check_desc: string;
		enable_image_download: string;
		enable_image_download_desc: string;
		post_import_limit: string;
		post_import_limit_desc: string;
		subscribed_blogs: string;
		add_blog_id: string;
		add_blog_id_desc: string;
		add_button: string;
		remove_button: string;
		sync_button: string;
		no_subscribed_blogs: string;
		posts_label: string;
	};
	notices: {
		api_key_required: string;
		set_api_key: string;
		no_active_file: string;
		ai_formatting_progress: string;
		content_too_short: string;
		ai_formatting_failed: string;
		ai_formatting_success: string;
		invalid_api_key: string;
		api_quota_exceeded: string;
		network_error: string;
		syncing_blog: string;
		sync_completed: string;
		subscribed_to: string;
		unsubscribed_from: string;
		blog_already_subscribed: string;
		file_already_exists: string;
		processing_post: string;
		post_imported: string;
		import_failed: string;
		downloading_images: string;
		image_download_complete: string;
		generating_ai_tags: string;
		generating_ai_excerpt: string;
		post_limit_exceeded: string;
	};
	modals: {
		import_single_post: {
			title: string;
			blog_id_label: string;
			blog_id_placeholder: string;
			log_no_label: string;
			log_no_placeholder: string;
			import_button: string;
			cancel_button: string;
		};
		import_blog_url: {
			title: string;
			url_label: string;
			url_placeholder: string;
			import_button: string;
			cancel_button: string;
		};
		subscribe_blog: {
			title: string;
			blog_id_label: string;
			blog_id_desc: string;
			blog_id_placeholder: string;
			subscribe_button: string;
		};
	};
	errors: {
		invalid_url: string;
		invalid_blog_id: string;
		invalid_log_no: string;
		fetch_failed: string;
		parse_failed: string;
		save_failed: string;
		ai_error: string;
		network_timeout: string;
		unauthorized: string;
		rate_limit: string;
	};
	providers: {
		openai: string;
		anthropic: string;
		google: string;
		ollama: string;
	};
}