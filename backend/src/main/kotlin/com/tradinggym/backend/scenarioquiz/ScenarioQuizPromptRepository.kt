package com.tradinggym.backend.scenarioquiz

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ScenarioQuizPromptRepository : JpaRepository<ScenarioQuizPrompt, UUID>
